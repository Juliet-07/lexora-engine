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

    // Real unread counts — one aggregate query for every ADR case
    // at once, not N+1. Litigation has no messaging yet.
    const unreadByCaseId = await this.unreadCountsFor(tenantId, adrCases);

    return [
      ...adrCases.map((c) => ({
        ...this.stripInternal(c),
        caseType: 'ADR' as const,
        unreadMessages: unreadByCaseId[String(c._id)] ?? 0,
      })),
      ...litigationCases.map((c) => ({
        ...this.stripInternal(c),
        caseType: 'Litigation' as const,
        unreadMessages: 0,
      })),
    ].sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  private async unreadCountsFor(tenantId: string, adrCases: any[]) {
    if (!adrCases.length) return {} as Record<string, number>;
    // Each case has its own read-cutoff (messagesLastReadByClientAt),
    // so this is computed per case rather than one shared aggregate
    // condition. Case volume per client is small, so N queries here
    // is the right trade for correctness over aggregate cleverness.
    const counts: Record<string, number> = {};
    await Promise.all(
      adrCases.map(async (c) => {
        counts[String(c._id)] = await this.messageModel.countDocuments({
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
    if (caseType === 'adr') {
      unreadMessages = await this.messageModel.countDocuments({
        tenantId: new Types.ObjectId(tenantId),
        caseId: c._id,
        direction: MessageDirection.TENANT,
        createdAt: c.messagesLastReadByClientAt
          ? { $gt: c.messagesLastReadByClientAt }
          : { $exists: true },
      });
    }

    return {
      ...this.stripInternal(c),
      caseType: caseType === 'adr' ? ('ADR' as const) : ('Litigation' as const),
      unreadMessages,
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

  async markMessagesRead(
    tenantId: string,
    clientUserId: string,
    caseId: string,
  ) {
    await this.assertOwnsAdrCase(tenantId, clientUserId, caseId);
    await this.adrModel.updateOne(
      { _id: caseId, tenantId: new Types.ObjectId(tenantId) },
      { $set: { messagesLastReadByClientAt: new Date() } },
    );
    return { success: true };
  }
}
