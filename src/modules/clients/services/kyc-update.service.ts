import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  KycUpdateRequest,
  KycUpdateRequestDocument,
  KycUpdateStatus,
} from '../schemas/kyc-update-request.schema';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface SaveKycUpdateDto {
  formData?: Record<string, any>;
}
interface SubmitKycUpdateDto {
  formData: Record<string, any>;
}
interface DocumentDto {
  name: string;
  category: string;
  url: string;
  mimeType?: string;
  size?: number;
  description?: string;
}

@Injectable()
export class KycUpdateService {
  constructor(
    @InjectModel(KycUpdateRequest.name)
    private readonly model: Model<KycUpdateRequestDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── GET — the client's current open request, if any. Deliberately
  // never auto-creates one: a KYC update only ever exists because a
  // tenant explicitly requested it. ──
  async getOpenRequest(clientId: string) {
    const record = await this.model
      .findOne({
        clientId: new Types.ObjectId(clientId),
        status: { $in: [KycUpdateStatus.REQUESTED, KycUpdateStatus.SUBMITTED] },
      })
      .sort({ createdAt: -1 })
      .lean();

    if (!record) {
      throw new NotFoundException('No open KYC update request found.');
    }
    return record;
  }

  // ── SAVE — merge partial formData, same real merge-not-overwrite
  // pattern as onboarding. Never touches the client's kycStatus. ──
  async save(clientId: string, dto: SaveKycUpdateDto) {
    const record = await this.model.findOne({
      clientId: new Types.ObjectId(clientId),
      status: { $in: [KycUpdateStatus.REQUESTED, KycUpdateStatus.SUBMITTED] },
    });
    if (!record) {
      throw new NotFoundException('No open KYC update request found.');
    }
    if (record.status === KycUpdateStatus.SUBMITTED) {
      throw new BadRequestException(
        'This update has already been submitted and is awaiting review.',
      );
    }

    const update: any = { lastSavedAt: new Date() };
    if (dto.formData) {
      update.formData = { ...(record.formData || {}), ...dto.formData };
    }

    return this.model.findByIdAndUpdate(
      record._id,
      { $set: update },
      { new: true },
    );
  }

  async addDocument(clientId: string, dto: DocumentDto) {
    const record = await this.model.findOne({
      clientId: new Types.ObjectId(clientId),
      status: KycUpdateStatus.REQUESTED,
    });
    if (!record) {
      throw new NotFoundException('No open KYC update request found.');
    }
    return this.model.findByIdAndUpdate(
      record._id,
      {
        $push: {
          documents: { ...dto, uploadedAt: new Date() },
        },
      },
      { new: true },
    );
  }

  async removeDocument(clientId: string, url: string) {
    const record = await this.model.findOne({
      clientId: new Types.ObjectId(clientId),
      status: KycUpdateStatus.REQUESTED,
    });
    if (!record) {
      throw new NotFoundException('No open KYC update request found.');
    }
    return this.model.findByIdAndUpdate(
      record._id,
      { $pull: { documents: { url } } },
      { new: true },
    );
  }

  // ── SUBMIT — lock the update for tenant review. Still never
  // touches the client's active kycStatus. ──
  async submit(clientId: string, dto: SubmitKycUpdateDto) {
    const record = await this.model.findOne({
      clientId: new Types.ObjectId(clientId),
      status: KycUpdateStatus.REQUESTED,
    });
    if (!record) {
      throw new NotFoundException(
        'No open KYC update request found, or it has already been submitted.',
      );
    }

    record.formData = { ...(record.formData || {}), ...dto.formData };
    record.status = KycUpdateStatus.SUBMITTED;
    record.submittedAt = new Date();
    await record.save();

    this.eventEmitter.emit('tenant.kyc_update.submitted', {
      tenantId: String(record.tenantId),
      clientUserId: String(record.clientId),
      requestId: String(record._id),
    });

    return record;
  }
}
