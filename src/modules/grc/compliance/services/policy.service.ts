import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { Policy, PolicyDocument, PolicyType } from '../schemas';
import { CreatePolicyDto, SubmitBoardAckDto } from '../dtos';
import { BoardMemberService } from 'src/modules/grc/governance/services';
import { EmailService } from 'src/common/utils/mailing/email.service';

@Injectable()
export class PolicyService {
  constructor(
    @InjectModel(Policy.name) private readonly model: Model<PolicyDocument>,
    private readonly boardMemberService: BoardMemberService,
    private readonly emailService: EmailService,
  ) {}

  async create(
    tenantId: string,
    dto: CreatePolicyDto,
    file: Express.Multer.File,
    businessName: string,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const policy = await this.model.create({
      tenantId: tId,
      title: dto.title,
      category: dto.category ?? '',
      type: dto.type,
      fileName: file.originalname,
      fileUrl: `/uploads/grc/policies/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      acknowledgments: [],
      ackTokens: [],
    });

    if (dto.type === PolicyType.BOARD) {
      const boardMembers = await this.boardMemberService.getAll(tenantId);
      const tokens = boardMembers.map((m: any) => ({
        token: randomBytes(24).toString('hex'),
        recipientEmail: m.email.toLowerCase(),
        recipientName: m.name,
        createdAt: new Date(),
      }));
      policy.ackTokens = tokens as any;
      policy.markModified('ackTokens');
      await policy.save();

      await Promise.all(
        tokens.map((t) =>
          this.emailService
            .sendPolicyForAcknowledgment({
              to: t.recipientEmail,
              recipientName: t.recipientName,
              policyTitle: policy.title,
              ackLink: `${process.env.TENANT_APP_URL}/policy-ack/${t.token}`,
              businessName,
            })
            .catch(() => {}),
        ),
      );
    }

    return policy;
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<PolicyDocument> {
    const p = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!p) throw new NotFoundException('Policy not found');
    return p;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.model.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Policy not found');
  }

  // Identity resolved server-side by the controller (real logged-in
  // user) — never trusted from the request body.
  async acknowledgeAsEmployee(
    tenantId: string,
    policyId: string,
    email: string,
    name: string,
    signature: string,
  ) {
    const policy = await this.getRawDoc(tenantId, policyId);
    if (policy.type !== PolicyType.ORGANISATION) {
      throw new BadRequestException(
        'Only organisation policies are acknowledged this way.',
      );
    }
    const normalizedEmail = email.toLowerCase();
    if (policy.acknowledgments.some((a) => a.email === normalizedEmail)) {
      throw new BadRequestException(
        'You have already acknowledged this policy.',
      );
    }
    policy.acknowledgments.push({
      name,
      email: normalizedEmail,
      signature,
      ackedAt: new Date(),
      source: 'employee',
    } as any);
    policy.markModified('acknowledgments');
    await policy.save();
    return policy;
  }

  // ── Public — board policy acknowledgment, no auth ─────────────

  async getAckSnapshot(token: string) {
    const policy = await this.model
      .findOne({ 'ackTokens.token': token })
      .lean();
    if (!policy)
      throw new NotFoundException('This acknowledgement link is invalid.');
    const tokenEntry = (policy.ackTokens as any[]).find(
      (t) => t.token === token,
    );
    const already = (policy.acknowledgments as any[]).some(
      (a) => a.email === tokenEntry.recipientEmail,
    );
    return {
      title: policy.title,
      category: policy.category,
      fileName: policy.fileName,
      fileUrl: policy.fileUrl,
      mimeType: policy.mimeType,
      uploadedAt: (policy as any).createdAt,
      prefillName: tokenEntry.recipientName,
      alreadyAcknowledged: already,
    };
  }

  async submitBoardAck(token: string, dto: SubmitBoardAckDto) {
    const policy = await this.model.findOne({ 'ackTokens.token': token });
    if (!policy)
      throw new NotFoundException('This acknowledgement link is invalid.');
    const tokenEntry = policy.ackTokens.find((t) => t.token === token);
    if (!tokenEntry)
      throw new NotFoundException('This acknowledgement link is invalid.');
    if (
      policy.acknowledgments.some((a) => a.email === tokenEntry.recipientEmail)
    ) {
      throw new BadRequestException(
        'This policy has already been acknowledged.',
      );
    }
    policy.acknowledgments.push({
      name: dto.name || tokenEntry.recipientName,
      email: tokenEntry.recipientEmail,
      signature: dto.signature,
      ackedAt: new Date(),
      source: 'external',
    } as any);
    policy.markModified('acknowledgments');
    await policy.save();
    return { success: true };
  }
}
