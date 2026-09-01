import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OnboardingSubmission,
  OnboardingDocument,
  OnboardingStatus,
} from '../schemas/onboarding.schema';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import {
  SaveOnboardingDto,
  SubmitOnboardingDto,
  AddDocumentDto,
  RemoveDocumentDto,
} from '../dto/onboarding.dto';
import {
  ClientProfileDocument,
  ClientProfileRecord,
} from 'src/modules/tenant/schemas/client-profile.schema';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class OnboardingService {
  constructor(
    @InjectModel(OnboardingSubmission.name)
    private readonly model: Model<OnboardingDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(ClientProfileRecord.name)
    private readonly profileModel: Model<ClientProfileDocument>,
    private readonly mailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── GET — load draft or create empty ─────────────────────
  async get(clientId: string) {
    let record = await this.model
      .findOne({ clientId: new Types.ObjectId(clientId) })
      .lean();

    if (!record) {
      const client = await this.userModel
        .findById(clientId)
        .select('tenantId clientProfile')
        .lean();
      if (!client) throw new NotFoundException('Client not found');

      const clientType =
        (client as any).clientProfile?.classifications || 'individual';

      const created = await this.model.create({
        clientId: new Types.ObjectId(clientId),
        tenantId: (client as any).tenantId,
        clientType,
        status: OnboardingStatus.DRAFT,
        formData: {},
        sectionCompletion: {},
        completionPercent: 0,
      });

      record = created.toObject();
    }

    return record;
  }

  // ── SAVE — merge partial formData, never overwrite untouched fields ──
  async save(clientId: string, dto: SaveOnboardingDto) {
    let record = await this.model.findOne({
      clientId: new Types.ObjectId(clientId),
    });

    if (!record) {
      await this.get(clientId);
      record = await this.model.findOne({
        clientId: new Types.ObjectId(clientId),
      });
    }

    if (record.status === OnboardingStatus.APPROVED) {
      throw new BadRequestException(
        'This form has already been approved and can no longer be edited.',
      );
    }

    if (record.status === OnboardingStatus.SUBMITTED) {
      throw new BadRequestException(
        'This form has already been submitted. Contact your advisor to request changes.',
      );
    }

    const update: any = { lastSavedAt: new Date() };

    // Spread merge — only incoming fields overwrite, rest preserved
    if (dto.formData) {
      update.formData = { ...(record.formData || {}), ...dto.formData };
    }
    if (dto.sectionCompletion) {
      update.sectionCompletion = {
        ...(record.sectionCompletion || {}),
        ...dto.sectionCompletion,
      };
    }
    if (dto.completionPercent !== undefined) {
      update.completionPercent = dto.completionPercent;
    }

    await this.profileModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(clientId),
        kycStatus: 'not_started',
      },
      { kycStatus: 'in_progress' },
    );

    return this.model.findOneAndUpdate(
      { clientId: new Types.ObjectId(clientId) },
      { $set: update },
      { new: true },
    );
  }

  // ── SUBMIT — validate, lock, stamp ───────────────────────
  async submit(clientId: string, dto: SubmitOnboardingDto, ipAddress: string) {
    const record = await this.model.findOne({
      clientId: new Types.ObjectId(clientId),
    });
    if (!record) {
      throw new NotFoundException(
        'No onboarding form found. Open the form first.',
      );
    }

    if (record.status === OnboardingStatus.APPROVED) {
      throw new BadRequestException(
        'This form has been approved and can no longer be submitted.',
      );
    }

    if (record.status === OnboardingStatus.SUBMITTED) {
      throw new BadRequestException('Already Submitted');
    }

    if (!dto.agreeTrue || !dto.agreeUpdate || !dto.agreeConsent) {
      throw new BadRequestException(
        'All declaration checkboxes must be accepted before submitting.',
      );
    }
    if (!dto.signature?.trim()) {
      throw new BadRequestException('Signature is required.');
    }

    const finalFormData = {
      ...(record.formData || {}),
      ...dto.formData,
      _declaration: {
        agreeTrue: dto.agreeTrue,
        agreeUpdate: dto.agreeUpdate,
        agreeConsent: dto.agreeConsent,
        signature: dto.signature,
        signatoryTitle: dto.signatoryTitle,
        signedAt: new Date(),
        ipAddress,
      },
    };

    const submitted = await this.model.findOneAndUpdate(
      { clientId: new Types.ObjectId(clientId) },
      {
        $set: {
          status: OnboardingStatus.SUBMITTED,
          formData: finalFormData,
          completionPercent: 100,
          submittedAt: new Date(),
          lastSavedAt: new Date(),
        },
      },
      { new: true },
    );

    const client = await this.userModel
      .findById(clientId)
      .select('firstName lastName email tenantId')
      .lean();

    await Promise.all([
      this.userModel.findByIdAndUpdate(clientId, {
        'clientProfile.kycStatus': 'submitted',
      }),
      this.profileModel.findOneAndUpdate(
        {
          userId: new Types.ObjectId(clientId),
        },
        {
          kycStatus: 'submitted',
          $push: {
            'metadata.auditTrail': {
              action: 'onboarding_submitted',
              timestamp: new Date(),
            },
          },
        },
      ),
    ]);

    if (client && (client as any).tenantId) {
      try {
        const tenant = await this.userModel
          .findById((client as any).tenantId)
          .select('email firstName tenantProfile.businessName')
          .lean();

        if (tenant) {
          const clientFullName = `${(client as any).firstName} ${(client as any).lastName}`;
          const businessName =
            (tenant as any)?.tenantProfile?.businessName || 'Your Firm';
          const dashboardUrl = `${process.env.TENANT_APP_URL}/clients/onboarding/${clientId}`;

          await this.mailService.sendOnboardingSubmittedNotification({
            to: (tenant as any).email,
            tenantFirstName: (tenant as any).firstName,
            clientName: clientFullName,
            clientEmail: (client as any).email,
            submittedAt: new Date(),
            businessName,
            dashboardUrl,
          });
        }
      } catch (err) {
        // Log but don't throw — email failure must not fail the submission
        console.error(
          'Failed to notify tenant of onboarding submission:',
          err.message,
        );
      }

      // Real email above already covers this event — the listener
      // for this specific event only needs to create the in-app
      // record, not send a second email.
      this.eventEmitter.emit('tenant.onboarding.submitted', {
        tenantId: String((client as any).tenantId),
        clientUserId: clientId,
        clientName: `${(client as any).firstName} ${(client as any).lastName}`,
      });
    }

    return submitted;
  }

  // ── ADD DOCUMENT ──────────────────────────────────────────
  async addDocument(clientId: string, dto: AddDocumentDto) {
    const record = await this.model.findOne({
      clientId: new Types.ObjectId(clientId),
    });
    if (!record)
      throw new NotFoundException(
        'Open the form first (GET /client/onboarding).',
      );
    if (
      record.status === OnboardingStatus.SUBMITTED ||
      record.status === OnboardingStatus.APPROVED
    ) {
      throw new BadRequestException('Cannot add documents after submission.');
    }
    if (record.documents?.some((d) => d.url === dto.url)) {
      throw new BadRequestException('This document URL is already attached.');
    }

    return this.model.findOneAndUpdate(
      { clientId: new Types.ObjectId(clientId) },
      {
        $push: { documents: { ...dto, uploadedAt: new Date() } },
        $set: { lastSavedAt: new Date() },
      },
      { new: true },
    );
  }

  // ── REMOVE DOCUMENT ───────────────────────────────────────
  async removeDocument(clientId: string, dto: RemoveDocumentDto) {
    const record = await this.model.findOne({
      clientId: new Types.ObjectId(clientId),
    });
    if (!record) throw new NotFoundException('Form not found.');
    if (
      record.status === OnboardingStatus.SUBMITTED ||
      record.status === OnboardingStatus.APPROVED
    ) {
      throw new BadRequestException(
        'Cannot remove documents after submission.',
      );
    }

    return this.model.findOneAndUpdate(
      { clientId: new Types.ObjectId(clientId) },
      {
        $pull: { documents: { url: dto.url } },
        $set: { lastSavedAt: new Date() },
      },
      { new: true },
    );
  }

  // ── TENANT: view a client's form ──────────────────────────
  async getTenantView(clientId: string, tenantId: string) {
    const record = await this.model
      .findOne({
        clientId: new Types.ObjectId(clientId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .lean();
    if (!record) throw new NotFoundException('Onboarding record not found.');

    const client = await this.userModel
      .findById(clientId)
      .select('firstName lastName email phone status clientProfile')
      .lean();

    return { client, onboarding: record };
  }

  // ── TENANT: list submitted forms ──────────────────────────
  async listForTenant(tenantId: string, status?: OnboardingStatus) {
    const query: any = {
      tenantId: new Types.ObjectId(tenantId),
      status: status || { $ne: OnboardingStatus.DRAFT },
    };

    const records = await this.model
      .find(query)
      .sort({ submittedAt: -1 })
      .lean();
    const clientIds = records.map((r) => r.clientId);
    const clients = await this.userModel
      .find({ _id: { $in: clientIds } })
      .select('firstName lastName email phone status clientProfile')
      .lean();

    const map = clients.reduce(
      (m, c) => {
        m[c._id.toString()] = c;
        return m;
      },
      {} as Record<string, any>,
    );

    return records.map((r) => ({
      ...r,
      client: map[r.clientId.toString()] || null,
    }));
  }
}
