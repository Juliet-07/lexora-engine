import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ClientPipelineRecord,
  ClientPipelineDocument,
  ClientPipelineStage,
} from '../schemas';
import { MoveClientStageDto } from '../dtos';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import {
  ClientProfileRecord,
  ClientProfileDocument,
} from 'src/modules/tenant/schemas/client-profile.schema';

@Injectable()
export class ClientPipelineService {
  constructor(
    @InjectModel(ClientPipelineRecord.name)
    private readonly pipelineModel: Model<ClientPipelineDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(ClientProfileRecord.name)
    private readonly clientProfileModel: Model<ClientProfileDocument>,
  ) {}

  async create(
    tenantId: string,
    clientUserId: string,
    convertedFromLeadId: string | null,
  ): Promise<ClientPipelineDocument> {
    return this.pipelineModel.create({
      tenantId: new Types.ObjectId(tenantId),
      clientUserId: new Types.ObjectId(clientUserId),
      convertedFromLeadId: convertedFromLeadId
        ? new Types.ObjectId(convertedFromLeadId)
        : null,
      stage: ClientPipelineStage.ACTIVE,
      clientSince: new Date(),
    });
  }

  // Enriched card data for the board — joins in name/email from
  // User and kycStatus from ClientProfileRecord. Read-only: CRM
  // never writes to either of those collections.
  async getBoardColumn(tenantId: string, stage: ClientPipelineStage) {
    const tId = new Types.ObjectId(tenantId);
    const records = await this.pipelineModel
      .find({ tenantId: tId, stage })
      .sort({ clientSince: -1 })
      .lean();

    const userIds = records.map((r) => r.clientUserId);
    const [users, profiles] = await Promise.all([
      this.userModel
        .find({ _id: { $in: userIds } })
        .select('firstName lastName email')
        .lean(),
      this.clientProfileModel
        .find({ userId: { $in: userIds } })
        .select('userId kycStatus riskLevel entityProfile.companyName')
        .lean(),
    ]);
    const userById = new Map(
      users.map((u) => [(u._id as Types.ObjectId).toString(), u]),
    );
    const profileByUser = new Map(
      profiles.map((p) => [(p.userId as Types.ObjectId).toString(), p]),
    );

    return records.map((r) => {
      const uid = r.clientUserId.toString();
      const user = userById.get(uid);
      const profile = profileByUser.get(uid);
      const companyName = (profile as any)?.entityProfile?.companyName;
      return {
        pipelineId: (r._id as Types.ObjectId).toString(),
        clientUserId: uid,
        name:
          companyName ||
          `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
        email: user?.email ?? null,
        kycStatus: profile?.kycStatus ?? 'not_started',
        riskLevel: profile?.riskLevel ?? 'unrated',
        clientSince: r.clientSince,
        projectCount: r.projectCount,
      };
    });
  }

  async moveStage(
    tenantId: string,
    pipelineId: string,
    dto: MoveClientStageDto,
  ): Promise<ClientPipelineDocument> {
    const record = await this.pipelineModel.findOne({
      _id: pipelineId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!record)
      throw new NotFoundException('Client pipeline record not found');

    if (dto.stage === ClientPipelineStage.PAST && !dto.reason?.trim()) {
      throw new BadRequestException(
        'A reason is required when marking a client as past/churned.',
      );
    }

    record.stage = dto.stage;
    if (dto.stage === ClientPipelineStage.PAST) {
      record.churnedAt = new Date();
      record.churnReason = dto.reason!.trim();
    } else {
      record.churnedAt = null;
      record.churnReason = null;
    }
    await record.save();
    return record;
  }

  async getCounts(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const [active, retained, past] = await Promise.all([
      this.pipelineModel.countDocuments({
        tenantId: tId,
        stage: ClientPipelineStage.ACTIVE,
      }),
      this.pipelineModel.countDocuments({
        tenantId: tId,
        stage: ClientPipelineStage.RETAINED,
      }),
      this.pipelineModel.countDocuments({
        tenantId: tId,
        stage: ClientPipelineStage.PAST,
      }),
    ]);
    return { active, retained, past };
  }
}
