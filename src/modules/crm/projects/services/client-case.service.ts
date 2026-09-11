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
  LitigationCaseMessage,
  LitigationCaseMessageDocument,
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
    @InjectModel(LitigationCaseMessage.name)
    private readonly litigationMessageModel: Model<LitigationCaseMessageDocument>,
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

    // Real unread counts — one pass per case type, not N+1 across
    // both combined.
    const [adrUnread, litigationUnread] = await Promise.all([
      this.unreadCountsFor(tenantId, adrCases, this.messageModel),
      this.unreadCountsFor(
        tenantId,
        litigationCases,
        this.litigationMessageModel,
      ),
    ]);

    return [
      ...adrCases.map((c) => ({
        ...this.stripInternal(c),
        caseType: 'ADR' as const,
        unreadMessages: adrUnread[String(c._id)] ?? 0,
      })),
      ...litigationCases.map((c) => ({
        ...this.stripInternal(c),
        caseType: 'Litigation' as const,
        unreadMessages: litigationUnread[String(c._id)] ?? 0,
      })),
    ].sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  private async unreadCountsFor(
    tenantId: string,
    cases: any[],
    messageModel: Model<any>,
  ) {
    if (!cases.length) return {} as Record<string, number>;
    // Each case has its own read-cutoff (messagesLastReadByClientAt),
    // so this is computed per case rather than one shared aggregate
    // condition. Case volume per client is small, so N queries here
    // is the right trade for correctness over aggregate cleverness.
    const counts: Record<string, number> = {};
    await Promise.all(
      cases.map(async (c) => {
        counts[String(c._id)] = await messageModel.countDocuments({
          tenantId: new Types.ObjectId(tenantId),
          caseId: c._id,
          direction: MessageDirection.TENANT,
          createdAt: c.messagesLastReadByClientAt
            ? { $gt: c.messagesLastReadByClientAt }
            : { $exists: true },
        });
      }),
    );
    return counts;
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

    let unreadMessages = 0;
    const msgModel =
      caseType === 'adr' ? this.messageModel : this.litigationMessageModel;
    unreadMessages = await msgModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
      caseId: c._id,
      direction: MessageDirection.TENANT,
      createdAt: (c as any).messagesLastReadByClientAt
        ? { $gt: (c as any).messagesLastReadByClientAt }
        : { $exists: true },
    });

    return {
      ...this.stripInternal(c),
      caseType: caseType === 'adr' ? ('ADR' as const) : ('Litigation' as const),
      unreadMessages,
    };
  }

  // ── Communication — both ADR and litigation. ──
  private async assertOwnsCase(
    tenantId: string,
    clientUserId: string,
    caseId: string,
    caseType: 'adr' | 'litigation',
  ) {
    const mandateIds = await this.myMandateIds(tenantId, clientUserId);
    const model: Model<any> =
      caseType === 'adr' ? this.adrModel : this.litigationModel;
    const c = await model
      .findOne({
        _id: caseId,
        tenantId: new Types.ObjectId(tenantId),
        mandateId: { $in: mandateIds },
      })
      .lean();
    if (!c) throw new NotFoundException('Case not found');
    return c;
  }

  async getMessages(
    tenantId: string,
    clientUserId: string,
    caseId: string,
    caseType: 'adr' | 'litigation' = 'adr',
  ) {
    await this.assertOwnsCase(tenantId, clientUserId, caseId, caseType);
    const model =
      caseType === 'adr' ? this.messageModel : this.litigationMessageModel;
    return model
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
    caseType: 'adr' | 'litigation' = 'adr',
  ) {
    const c = await this.assertOwnsCase(
      tenantId,
      clientUserId,
      caseId,
      caseType,
    );
    const model =
      caseType === 'adr' ? this.messageModel : this.litigationMessageModel;
    const created = await model.create({
      tenantId: new Types.ObjectId(tenantId),
      caseId: new Types.ObjectId(caseId),
      direction: MessageDirection.CLIENT,
      author: dto.author,
      body: dto.body,
    });

    this.eventEmitter.emit('tenant.case.client_replied', {
      tenantId,
      caseId,
      caseType: caseType === 'adr' ? 'ADR' : 'Litigation',
      caseTitle: (c as any).title,
      caseRef: (c as any).ref,
    });

    return created.toObject();
  }

  async markMessagesRead(
    tenantId: string,
    clientUserId: string,
    caseId: string,
    caseType: 'adr' | 'litigation' = 'adr',
  ) {
    await this.assertOwnsCase(tenantId, clientUserId, caseId, caseType);
    const model: Model<any> =
      caseType === 'adr' ? this.adrModel : this.litigationModel;
    await model.updateOne(
      { _id: caseId, tenantId: new Types.ObjectId(tenantId) },
      { $set: { messagesLastReadByClientAt: new Date() } },
    );
    return { success: true };
  }
}
