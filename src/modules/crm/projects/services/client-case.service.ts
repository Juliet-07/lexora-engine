import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Mandate,
  MandateDocument_,
  AdrCase,
  AdrCaseDocument,
  AdrCaseMessage,
  AdrCaseMessageDocument,
  MessageDirection,
  LitigationCase,
  LitigationCaseDocument,
} from '../schemas';

// Same real scoping discipline as ClientProjectsService: a client
// only ever sees ADR/litigation cases sitting under a mandate that
// is genuinely theirs (Mandate.clientUserId). Internal-only fields
// (disbursements — the firm's actual costs, and checklist — internal
// task tracking) are stripped before anything reaches the client.
@Injectable()
export class ClientCaseService {
  constructor(
    @InjectModel(Mandate.name)
    private readonly mandateModel: Model<MandateDocument_>,
    @InjectModel(AdrCase.name)
    private readonly adrModel: Model<AdrCaseDocument>,
    @InjectModel(AdrCaseMessage.name)
    private readonly messageModel: Model<AdrCaseMessageDocument>,
    @InjectModel(LitigationCase.name)
    private readonly litigationModel: Model<LitigationCaseDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private stripInternal(c: any) {
    const { disbursements, checklist, ...rest } = c;
    return rest;
  }

  private async myMandateIds(tenantId: string, clientUserId: string) {
    const mandates = await this.mandateModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        clientUserId: new Types.ObjectId(clientUserId),
      })
      .select('_id')
      .lean();
    return mandates.map((m) => m._id);
  }

  async getMyCases(tenantId: string, clientUserId: string) {
    const mandateIds = await this.myMandateIds(tenantId, clientUserId);
    if (!mandateIds.length) return [];

    const [adrCases, litigationCases] = await Promise.all([
      this.adrModel
        .find({ mandateId: { $in: mandateIds } })
        .sort({ createdAt: -1 })
        .lean(),
      this.litigationModel
        .find({ mandateId: { $in: mandateIds } })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    return [
      ...adrCases.map((c) => ({
        ...this.stripInternal(c),
        caseType: 'ADR' as const,
      })),
      ...litigationCases.map((c) => ({
        ...this.stripInternal(c),
        caseType: 'Litigation' as const,
      })),
    ].sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async getMyCase(
    tenantId: string,
    clientUserId: string,
    caseType: 'adr' | 'litigation',
    id: string,
  ) {
    const mandateIds = await this.myMandateIds(tenantId, clientUserId);
    const model: Model<any> =
      caseType === 'adr' ? this.adrModel : this.litigationModel;

    const c = await model
      .findOne({
        _id: id,
        tenantId: new Types.ObjectId(tenantId),
        mandateId: { $in: mandateIds },
      })
      .lean();
    if (!c) throw new NotFoundException('Case not found');

    return {
      ...this.stripInternal(c),
      caseType: caseType === 'adr' ? ('ADR' as const) : ('Litigation' as const),
    };
  }

  // ── Communication — ADR only for now; litigation messaging is a
  // later phase of this build. ──
  private async assertOwnsAdrCase(
    tenantId: string,
    clientUserId: string,
    caseId: string,
  ) {
    const mandateIds = await this.myMandateIds(tenantId, clientUserId);
    const c = await this.adrModel
      .findOne({
        _id: caseId,
        tenantId: new Types.ObjectId(tenantId),
        mandateId: { $in: mandateIds },
      })
      .lean();
    if (!c) throw new NotFoundException('Case not found');
    return c;
  }

  async getMessages(tenantId: string, clientUserId: string, caseId: string) {
    await this.assertOwnsAdrCase(tenantId, clientUserId, caseId);
    return this.messageModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        caseId: new Types.ObjectId(caseId),
      })
      .sort({ createdAt: 1 })
      .lean();
  }

  async sendMessage(
    tenantId: string,
    clientUserId: string,
    caseId: string,
    dto: { author: string; body: string },
  ) {
    const c = await this.assertOwnsAdrCase(tenantId, clientUserId, caseId);
    const created = await this.messageModel.create({
      tenantId: new Types.ObjectId(tenantId),
      caseId: new Types.ObjectId(caseId),
      direction: MessageDirection.CLIENT,
      author: dto.author,
      body: dto.body,
    });

    this.eventEmitter.emit('tenant.case.client_replied', {
      tenantId,
      caseId,
      caseType: 'ADR',
      caseTitle: c.title,
      caseRef: c.ref,
    });

    return created.toObject();
  }
}
