import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TrustLedger,
  TrustLedgerDocument,
  TrustMovement,
  TrustMovementDocument,
  TrustMovementType,
  TrustMovementStatus,
  TrustLedgerStatus,
  TrustDrawdownType,
  TrustLinkType,
  TrustAuditAction,
  BankAccount,
  BankAccountDocument,
  BankAccountType,
  Invoice,
  InvoiceDocument,
  InvoiceStage,
  Bill,
  BillDocument,
  BillStatus,
  PaymentMethod,
  GlSource,
} from '../schemas';
import {
  CreateTrustLedgerDto,
  UpdateTrustLedgerDto,
  RecordTrustDepositDto,
  RequestTrustDrawdownDto,
} from '../dtos';
import { GlPostingService, GL_ACCOUNTS } from './gl-posting.service';
import { BankAccountService } from './banking.service';
import { InvoiceService, PaymentService } from './invoice.service';
import { MandateService } from 'src/modules/crm/projects/services';
import {
  TrustAuditService,
  TrustNotifierService,
} from './trust-support.service';
import type { TrustActor } from './trust-support.service';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n: number, cur: string) =>
  `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface TrustUploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  path: string;
}

const toFileUrl = (filePath: string): string => {
  const raw = filePath.replace(/\\/g, '/');
  const i = raw.indexOf('uploads/');
  return `${process.env.APP_URL}/${i !== -1 ? raw.slice(i) : raw}`;
};

const toDocs = (files: TrustUploadedFile[] = []) =>
  files.map((f) => ({
    name: f.originalname,
    url: toFileUrl(f.path),
    path: f.path,
    mimeType: f.mimetype,
    size: f.size,
    uploadedAt: new Date(),
  }));

// ── Trust ledgers — a per-client sub-ledger within the firm's real
// Trust-type bank account. Balance is never stored — always
// computed live from real movements, the exact discipline
// BankAccount's own balance already follows. ─────────────────────

@Injectable()
export class TrustLedgerService {
  constructor(
    @InjectModel(TrustLedger.name)
    private readonly model: Model<TrustLedgerDocument>,
    @InjectModel(TrustMovement.name)
    private readonly movementModel: Model<TrustMovementDocument>,
    @InjectModel(BankAccount.name)
    private readonly bankAccountModel: Model<BankAccountDocument>,
    private readonly bankAccountService: BankAccountService,
    private readonly mandateService: MandateService,
    private readonly audit: TrustAuditService,
    private readonly notifier: TrustNotifierService,
  ) {}

  // One aggregation for every ledger's figures, so the register never
  // pays one query per row.
  //  • balance  — recorded deposits + client interest − approved drawdowns
  //  • reserved — drawdowns awaiting authorisation (not yet real, but
  //               already spoken for, so they cannot be drawn twice)
  // Interest the firm keeps is never part of the client's balance.
  async figures(
    tenantId: string,
    ledgerIds?: string[],
  ): Promise<Map<string, { balance: number; reserved: number }>> {
    const match: any = { tenantId: new Types.ObjectId(tenantId) };
    if (ledgerIds)
      match.ledgerId = { $in: ledgerIds.map((i) => new Types.ObjectId(i)) };
    const rows = await this.movementModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$ledgerId',
          inflow: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $in: [
                        '$type',
                        [TrustMovementType.DEPOSIT, TrustMovementType.INTEREST],
                      ],
                    },
                    { $eq: ['$status', TrustMovementStatus.RECORDED] },
                    { $ne: ['$firmRetained', true] },
                  ],
                },
                '$amount',
                0,
              ],
            },
          },
          outflow: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$type', TrustMovementType.DRAWDOWN] },
                    { $eq: ['$status', TrustMovementStatus.APPROVED] },
                  ],
                },
                '$amount',
                0,
              ],
            },
          },
          reserved: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$type', TrustMovementType.DRAWDOWN] },
                    {
                      $eq: [
                        '$status',
                        TrustMovementStatus.AWAITING_AUTHORISATION,
                      ],
                    },
                  ],
                },
                '$amount',
                0,
              ],
            },
          },
        },
      },
    ]);
    return new Map(
      rows.map((r) => [
        String(r._id),
        { balance: round2(r.inflow - r.outflow), reserved: round2(r.reserved) },
      ]),
    );
  }

  async computeBalance(tenantId: string, ledgerId: string): Promise<number> {
    const f = (await this.figures(tenantId, [ledgerId])).get(ledgerId);
    return f?.balance ?? 0;
  }

  private decorate(l: any, f?: { balance: number; reserved: number }) {
    const balance = f?.balance ?? 0;
    const reserved = f?.reserved ?? 0;
    return {
      ...l,
      balance,
      reserved,
      available: round2(balance - reserved),
      belowMinimum: l.minBalance > 0 && balance < l.minBalance,
    };
  }

  async getAll(tenantId: string) {
    const ledgers = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
    const figs = await this.figures(tenantId);
    return ledgers.map((l) => this.decorate(l, figs.get(String(l._id))));
  }

  async getById(tenantId: string, id: string) {
    const l = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!l) throw new NotFoundException('Trust ledger not found');
    const figs = await this.figures(tenantId, [id]);
    const sourceDocs = await this.movementModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
      ledgerId: new Types.ObjectId(id),
      type: TrustMovementType.DEPOSIT,
      'documents.0': { $exists: true },
    });
    return {
      ...this.decorate(l, figs.get(id)),
      depositsWithEvidence: sourceDocs,
    };
  }

  // A ledger can only ever be linked to a real Trust-type bank
  // account — never Office. Getting this wrong at creation is the
  // one mistake that would let trust and office money commingle
  // from day one.
  async create(tenantId: string, dto: CreateTrustLedgerDto, actor: TrustActor) {
    const tId = new Types.ObjectId(tenantId);
    const bankAccount = await this.bankAccountModel
      .findOne({ _id: dto.bankAccountId, tenantId: tId })
      .lean();
    if (!bankAccount) throw new NotFoundException('Bank account not found');
    if (bankAccount.type !== BankAccountType.TRUST) {
      throw new BadRequestException(
        'Trust ledgers can only be linked to a Trust-type bank account',
      );
    }
    const currency = (
      dto.currency ??
      bankAccount.currency ??
      'USD'
    ).toUpperCase();
    if (bankAccount.currency && currency !== bankAccount.currency) {
      throw new BadRequestException(
        `This trust account holds ${bankAccount.currency} — a ${currency} ledger cannot sit in it. Pick a ${currency} trust account.`,
      );
    }

    let mandateName = dto.mandateName ?? '';
    let mandateReference = dto.mandateReference ?? '';
    if (dto.mandateId) {
      const m: any = await this.mandateService.getById(tenantId, dto.mandateId);
      if (String(m.clientUserId) !== dto.clientUserId) {
        throw new BadRequestException(
          'That mandate belongs to a different client',
        );
      }
      mandateName = m.name;
      mandateReference = mandateReference || m.ref;
    }

    if (!dto.sourceOfFunds?.trim()) {
      throw new BadRequestException(
        'Declare the expected source of funds — it is the first thing an AML/CFT inspection asks for',
      );
    }

    const created = await this.model.create({
      tenantId: tId,
      bankAccountId: new Types.ObjectId(dto.bankAccountId),
      clientUserId: new Types.ObjectId(dto.clientUserId),
      clientName: dto.clientName,
      mandateId: dto.mandateId ? new Types.ObjectId(dto.mandateId) : null,
      mandateName,
      mandateReference,
      currency,
      interestTreatment: dto.interestTreatment,
      interestRate: dto.interestRate ?? 0,
      interestCreditedThrough: new Date(),
      sourceOfFunds: dto.sourceOfFunds ?? '',
      expectedPurpose: dto.expectedPurpose ?? '',
      sourceOfFundsNotes: dto.sourceOfFundsNotes ?? '',
      riskLevel: dto.riskLevel,
      maxDrawdownPerRequest: dto.maxDrawdownPerRequest ?? 0,
      invoiceLinkedOnly: dto.invoiceLinkedOnly ?? false,
      status: dto.frozen ? TrustLedgerStatus.FROZEN : TrustLedgerStatus.ACTIVE,
      minBalance: dto.minBalance ?? 0,
      replenishmentTarget: dto.replenishmentTarget ?? 0,
      portalAccess: dto.portalAccess,
      portalContactEmail: dto.portalContactEmail ?? '',
      additionalPortalUsers: dto.additionalPortalUsers ?? [],
      emailDigest: dto.emailDigest ?? 'Real-time',
      ...(dto.notifyPrefs ? { notifyPrefs: dto.notifyPrefs } : {}),
    });

    await this.audit.log(tenantId, {
      action: TrustAuditAction.LEDGER_CREATED,
      ledger: created,
      details: `Opened ${currency} trust ledger${mandateReference ? ` for ${mandateReference}` : ''}${dto.frozen ? ' (created frozen)' : ''}`,
      currency,
      actor,
    });
    if (dto.frozen) {
      await this.audit.log(tenantId, {
        action: TrustAuditAction.FREEZE_APPLIED,
        ledger: created,
        details: 'Created in a frozen state',
        actor,
      });
    }
    const obj = created.toObject();
    await this.notifier.notify(
      tenantId,
      obj,
      'monthlyStatements',
      'Trust ledger opened',
      `A segregated ${currency} trust ledger has been opened for ${dto.clientName}. You will receive deposit confirmations, drawdown notices and statements here.`,
    );
    return this.decorate(obj, { balance: 0, reserved: 0 });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateTrustLedgerDto,
    actor: TrustActor,
    interestAccruedNow = 0,
  ) {
    const l = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!l) throw new NotFoundException('Trust ledger not found');

    const termsChanged =
      (dto.interestRate !== undefined && dto.interestRate !== l.interestRate) ||
      (dto.interestTreatment !== undefined &&
        dto.interestTreatment !== l.interestTreatment);
    if (termsChanged && interestAccruedNow > 0.005) {
      throw new BadRequestException(
        'Credit the interest accrued so far before changing the rate or treatment, so the old terms apply to the old period.',
      );
    }

    const changed: string[] = [];
    const set = (key: string, value: any) => {
      if (value === undefined) return;
      const cur = (l as any)[key];
      if (JSON.stringify(cur) === JSON.stringify(value)) return;
      (l as any)[key] = value;
      changed.push(key);
    };
    if (dto.mandateId !== undefined) {
      const m: any = await this.mandateService.getById(tenantId, dto.mandateId);
      if (String(m.clientUserId) !== String(l.clientUserId)) {
        throw new BadRequestException(
          'That mandate belongs to a different client',
        );
      }
      l.mandateId = new Types.ObjectId(dto.mandateId);
      l.mandateName = m.name;
      if (dto.mandateReference === undefined) l.mandateReference = m.ref;
      changed.push('mandate');
    }
    for (const k of [
      'mandateReference',
      'interestTreatment',
      'interestRate',
      'sourceOfFunds',
      'expectedPurpose',
      'sourceOfFundsNotes',
      'riskLevel',
      'maxDrawdownPerRequest',
      'invoiceLinkedOnly',
      'minBalance',
      'replenishmentTarget',
      'portalAccess',
      'portalContactEmail',
      'additionalPortalUsers',
      'emailDigest',
    ] as const) {
      set(k, (dto as any)[k]);
    }
    if (dto.mandateName !== undefined && dto.mandateId === undefined)
      set('mandateName', dto.mandateName);
    if (dto.notifyPrefs) {
      l.notifyPrefs = { ...(l.notifyPrefs ?? ({} as any)), ...dto.notifyPrefs };
      changed.push('notifyPrefs');
    }
    // Interest starts counting from the day a rate is first set — never
    // backwards over a period the ledger earned nothing.
    if ((l.interestRate ?? 0) > 0 && !l.interestCreditedThrough) {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      l.interestCreditedThrough = d;
    }
    if (!changed.length) return this.getById(tenantId, id);
    await l.save();
    await this.audit.log(tenantId, {
      action: TrustAuditAction.LEDGER_UPDATED,
      ledger: l,
      details: `Terms updated: ${changed.join(', ')}`,
      actor,
    });
    return this.getById(tenantId, id);
  }

  // Freeze, unfreeze, or move into closing. A frozen ledger takes no
  // deposits and no drawdowns; a closing ledger takes no deposits but
  // can still be paid out.
  async setStatus(
    tenantId: string,
    id: string,
    status: TrustLedgerStatus,
    reason: string | undefined,
    actor: TrustActor,
  ) {
    const l = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!l) throw new NotFoundException('Trust ledger not found');
    if (l.status === status) return this.getById(tenantId, id);
    if (status === TrustLedgerStatus.FROZEN && !reason?.trim()) {
      throw new BadRequestException('Say why this ledger is being frozen');
    }
    const from = l.status;
    l.status = status;
    await l.save();
    await this.audit.log(tenantId, {
      action:
        status === TrustLedgerStatus.FROZEN
          ? TrustAuditAction.FREEZE_APPLIED
          : TrustAuditAction.FREEZE_LIFTED,
      ledger: l,
      details: `${from} → ${status}${reason ? ` — ${reason}` : ''}`,
      actor,
    });
    return this.getById(tenantId, id);
  }

  // The real "no commingling" check — the trust bank account's own
  // real balance (Banking's computeBalance) must equal the sum of
  // every client ledger's real balance. Any gap means money has
  // moved that isn't accounted for at the client level.
  async getIntegrityCheck(tenantId: string, bankAccountId: string) {
    const ledgers = await this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        bankAccountId: new Types.ObjectId(bankAccountId),
      })
      .lean();
    const figs = await this.figures(
      tenantId,
      ledgers.map((l) => String(l._id)),
    );
    const rows = ledgers.map((l) => {
      const f = figs.get(String(l._id));
      return {
        ledgerId: String(l._id),
        clientName: l.clientName,
        mandateName: l.mandateName,
        currency: l.currency,
        balance: f?.balance ?? 0,
        depositsInTransit: 0,
        drawdownsClearing: f?.reserved ?? 0,
        lastReconciledAt: l.lastReconciledAt,
        status: l.status,
      };
    });
    const ledgerTotal = round2(rows.reduce((s, r) => s + r.balance, 0));
    const bankBalance = await this.bankAccountService.computeBalance(
      tenantId,
      bankAccountId,
    );
    return {
      bankAccountId,
      bankBalance,
      ledgerTotal,
      ledgerCount: ledgers.length,
      variance: round2(bankBalance - ledgerTotal),
      matched: Math.abs(bankBalance - ledgerTotal) < 0.01,
      ledgers: rows,
    };
  }

  // Runs the check for one trust account (or every one) and writes the
  // result — matched or not — into the audit trail, which is what the
  // reconciliation history report reads back.
  async runReconciliation(
    tenantId: string,
    bankAccountId: string | undefined,
    actor: TrustActor,
  ) {
    const accounts = await this.bankAccountModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        type: BankAccountType.TRUST,
        ...(bankAccountId ? { _id: new Types.ObjectId(bankAccountId) } : {}),
      })
      .lean();
    if (!accounts.length) {
      throw new BadRequestException(
        'There is no trust bank account to reconcile',
      );
    }
    const results: any[] = [];
    for (const a of accounts) {
      const r = await this.getIntegrityCheck(tenantId, String(a._id));
      results.push({ ...r, accountName: `${a.name} (${a.currency})` });
      await this.audit.log(tenantId, {
        action: TrustAuditAction.RECONCILIATION,
        details: `${a.name} (${a.currency}): bank ${fmt(r.bankBalance, a.currency)} vs ${r.ledgerCount} ledger(s) ${fmt(r.ledgerTotal, a.currency)} — ${r.matched ? 'balanced' : `VARIANCE ${fmt(r.variance, a.currency)}`}`,
        amount: r.variance,
        currency: a.currency,
        actor,
      });
    }
    return results;
  }

  async markReconciled(tenantId: string, id: string, actor: TrustActor) {
    const l = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!l) throw new NotFoundException('Trust ledger not found');
    l.lastReconciledAt = new Date();
    await l.save();
    const balance = await this.computeBalance(tenantId, id);
    await this.audit.log(tenantId, {
      action: TrustAuditAction.RECONCILIATION,
      ledger: l,
      details: `Ledger signed off at ${fmt(balance, l.currency)}`,
      amount: balance,
      currency: l.currency,
      actor,
    });
    return this.getById(tenantId, id);
  }
}

// ── Trust movements — deposits post immediately; drawdowns need a
// source document, then preparer-then-different-authoriser control
// (two authorisers above the ledger's per-request limit). The
// no-overdraw rule is enforced at request AND at authorisation, since
// the balance can genuinely change between the two. ───────────────

@Injectable()
export class TrustMovementService {
  constructor(
    @InjectModel(TrustMovement.name)
    private readonly model: Model<TrustMovementDocument>,
    @InjectModel(TrustLedger.name)
    private readonly ledgerModel: Model<TrustLedgerDocument>,
    @InjectModel(Invoice.name)
    private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
    @InjectModel(BankAccount.name)
    private readonly bankAccountModel: Model<BankAccountDocument>,
    private readonly ledgerService: TrustLedgerService,
    private readonly glPostingService: GlPostingService,
    private readonly invoiceService: InvoiceService,
    private readonly paymentService: PaymentService,
    private readonly mandateService: MandateService,
    private readonly audit: TrustAuditService,
    private readonly notifier: TrustNotifierService,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    // Movements are never deleted (a discarded draft is rejected, not
    // removed), so the running count is a safe, gap-free sequence.
    const count = await this.model.countDocuments({ tenantId });
    return `TM-${String(count + 101)}`;
  }

  async getAll(
    tenantId: string,
    f: {
      ledgerId?: string;
      type?: string;
      status?: string;
      from?: string;
      to?: string;
    } = {},
  ) {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (f.ledgerId) query.ledgerId = new Types.ObjectId(f.ledgerId);
    if (f.type && f.type !== 'all') query.type = f.type;
    if (f.status && f.status !== 'all') query.status = f.status;
    if (f.from || f.to) {
      query.date = {};
      if (f.from) query.date.$gte = new Date(f.from);
      if (f.to) {
        const end = new Date(f.to);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }
    const rows = await this.model
      .find(query)
      .sort({ date: -1, createdAt: -1 })
      .lean();
    const ledgers = await this.ledgerModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .select('clientName mandateName mandateReference currency')
      .lean();
    const byId = new Map(ledgers.map((l) => [String(l._id), l]));
    return rows.map((m) => {
      const l: any = byId.get(String(m.ledgerId));
      return {
        ...m,
        clientName: l?.clientName ?? '',
        mandateName: l?.mandateName ?? '',
        currency: m.currency || l?.currency || '',
      };
    });
  }

  // Everything in trust that was drawn against one source document —
  // lets an invoice or bill show what trust money has touched it.
  async getBySource(tenantId: string, linkType: TrustLinkType, linkId: string) {
    return this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        linkType,
        linkId: new Types.ObjectId(linkId),
      })
      .sort({ date: -1 })
      .lean();
  }

  private async getDoc(tenantId: string, movementId: string) {
    const m = await this.model.findOne({
      _id: movementId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!m) throw new NotFoundException('Movement not found');
    return m;
  }

  private async getLedgerRaw(tenantId: string, ledgerId: string) {
    const l: any = await this.ledgerService.getById(tenantId, ledgerId);
    return l;
  }

  // ── Deposit ────────────────────────────────────────────────────

  async recordDeposit(
    tenantId: string,
    dto: RecordTrustDepositDto,
    files: TrustUploadedFile[],
    actor: TrustActor,
  ) {
    const discard = () => files.forEach((f) => this.removeFile(f.path));
    try {
      const ledger = await this.getLedgerRaw(tenantId, dto.ledgerId);
      if (ledger.status === TrustLedgerStatus.FROZEN) {
        throw new BadRequestException(
          'This ledger is frozen — no deposits can be recorded until it is unfrozen',
        );
      }
      if (ledger.status === TrustLedgerStatus.CLOSING) {
        throw new BadRequestException(
          'This ledger is being closed and takes no new deposits',
        );
      }
      const tId = new Types.ObjectId(tenantId);
      // The same bank reference twice on one ledger is a double entry
      // — or someone trying to make one receipt count twice.
      const dup = await this.model
        .findOne({
          tenantId: tId,
          ledgerId: new Types.ObjectId(dto.ledgerId),
          type: TrustMovementType.DEPOSIT,
          reference: new RegExp(
            `^${dto.reference.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i',
          ),
        })
        .lean();
      if (dup) {
        throw new BadRequestException(
          `A deposit with bank reference "${dto.reference}" is already recorded on this ledger (${dup.ref})`,
        );
      }
      const ref = await this.nextRef(tId);
      const created = await this.model.create({
        tenantId: tId,
        ref,
        ledgerId: new Types.ObjectId(dto.ledgerId),
        type: TrustMovementType.DEPOSIT,
        amount: dto.amount,
        currency: ledger.currency,
        reference: dto.reference.trim(),
        date: new Date(dto.date),
        status: TrustMovementStatus.RECORDED,
        preparedBy: actor.name,
        preparedById: actor.id,
        remitterName: dto.remitterName ?? '',
        sourceOfFunds: dto.sourceOfFunds,
        purpose: dto.purpose ?? '',
        internalNotes: dto.internalNotes ?? '',
        narrative: dto.purpose ?? '',
        documents: toDocs(files),
      });

      // Real double-entry — money arriving in the ring-fenced trust
      // bank account, matched by an equal increase in what the firm
      // owes this client. Dr Bank-trust, Cr Client trust liability.
      await this.glPostingService.post(
        tenantId,
        [
          {
            date: new Date(dto.date),
            ref,
            description: `${ledger.clientName} — trust deposit`,
            accountCode: GL_ACCOUNTS.BANK_TRUST.code,
            accountName: GL_ACCOUNTS.BANK_TRUST.name,
            source: GlSource.TRUST,
            debit: dto.amount,
            sourceId: created._id,
          },
          {
            date: new Date(dto.date),
            ref,
            description: `${ledger.clientName} — trust deposit`,
            accountCode: GL_ACCOUNTS.CLIENT_TRUST_LIABILITY.code,
            accountName: GL_ACCOUNTS.CLIENT_TRUST_LIABILITY.name,
            source: GlSource.TRUST,
            credit: dto.amount,
            sourceId: created._id,
          },
        ],
        ledger.currency,
      );

      await this.audit.log(tenantId, {
        action: TrustAuditAction.DEPOSIT_RECORDED,
        ledger,
        movementId: created._id,
        details: `${ref} · ref ${dto.reference} · source: ${dto.sourceOfFunds}${dto.remitterName ? ` · from ${dto.remitterName}` : ''} · ${files.length} document(s)`,
        amount: dto.amount,
        currency: ledger.currency,
        actor,
      });
      await this.notifier.notify(
        tenantId,
        ledger,
        'depositConfirmations',
        'Deposit received',
        `${fmt(dto.amount, ledger.currency)} was received into your trust ledger (ref ${dto.reference}).`,
      );
      return created.toObject();
    } catch (e) {
      discard();
      throw e;
    }
  }

  // ── Drawdown: source-document validation ───────────────────────
  // The heart of the traceability rule. A drawdown has to point at a
  // real document that justifies it — an invoice, a bill, a mandate's
  // budget, an original deposit — and cannot take more than that
  // document still allows once every other open drawdown against it
  // is counted. Run again on authorisation, because the document can
  // change in between.

  private async committedAgainst(
    tenantId: Types.ObjectId,
    filter: any,
    excludeId?: any,
  ) {
    const agg = await this.model.aggregate([
      {
        $match: {
          tenantId,
          type: TrustMovementType.DRAWDOWN,
          status: {
            $in: [
              TrustMovementStatus.AWAITING_AUTHORISATION,
              TrustMovementStatus.APPROVED,
            ],
          },
          ...(excludeId
            ? { _id: { $ne: new Types.ObjectId(String(excludeId)) } }
            : {}),
          ...filter,
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return agg[0]?.total ?? 0;
  }

  private async resolveOfficeAccount(
    tenantId: Types.ObjectId,
    currency: string,
    officeBankAccountId?: string | null,
  ) {
    if (officeBankAccountId) {
      const a = await this.bankAccountModel
        .findOne({ _id: officeBankAccountId, tenantId })
        .lean();
      if (!a) throw new BadRequestException('Office bank account not found');
      if (a.type === BankAccountType.TRUST) {
        throw new BadRequestException(
          'Fees must land in an office account, not another trust account',
        );
      }
      return a;
    }
    const a = await this.bankAccountModel
      .findOne({
        tenantId,
        type: { $ne: BankAccountType.TRUST },
        currency,
      })
      .lean();
    if (!a) {
      throw new BadRequestException(
        `There is no ${currency} office bank account for the fees to land in — add one in Banking first`,
      );
    }
    return a;
  }

  private async validateDrawdown(
    tenantId: string,
    ledger: any,
    p: {
      drawdownType: TrustDrawdownType;
      amount: number;
      linkedInvoiceId?: string | null;
      linkedBillId?: string | null;
      mandateId?: string | null;
      linkedDepositId?: string | null;
      payeeName?: string;
      officeBankAccountId?: string | null;
      hasDocuments: boolean;
    },
    excludeId?: any,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const out = {
      linkType: null as TrustLinkType | null,
      linkId: null as Types.ObjectId | null,
      linkRef: '',
      linkLabel: '',
      payeeName: p.payeeName ?? '',
      officeBankAccountId: null as Types.ObjectId | null,
    };
    const invoiceKind =
      p.drawdownType === TrustDrawdownType.INVOICE ||
      p.drawdownType === TrustDrawdownType.TRUST_TO_OFFICE;

    if (ledger.status === TrustLedgerStatus.FROZEN) {
      throw new BadRequestException(
        'This ledger is frozen — no drawdowns can be made until it is unfrozen',
      );
    }
    if (ledger.invoiceLinkedOnly && !invoiceKind) {
      throw new BadRequestException(
        'This ledger only allows drawdowns against an invoice — ad-hoc drawdowns are restricted',
      );
    }

    if (invoiceKind) {
      if (!p.linkedInvoiceId) {
        throw new BadRequestException(
          'Select the invoice this drawdown pays — a drawdown without a source document cannot be prepared',
        );
      }
      const inv: any = await this.invoiceModel
        .findOne({ _id: p.linkedInvoiceId, tenantId: tId })
        .lean();
      if (!inv) throw new NotFoundException('Invoice not found');
      if (String(inv.clientUserId) !== String(ledger.clientUserId)) {
        throw new BadRequestException(
          `${inv.ref} was issued to ${inv.clientName}, not to this ledger's client`,
        );
      }
      if (
        [
          InvoiceStage.DRAFT,
          InvoiceStage.IN_REVIEW,
          InvoiceStage.PAID,
          InvoiceStage.WRITTEN_OFF,
          InvoiceStage.CANCELLED,
        ].includes(inv.stage)
      ) {
        throw new BadRequestException(
          `${inv.ref} is ${inv.stage} — only an issued, unpaid invoice can be paid from trust`,
        );
      }
      if (inv.currency !== ledger.currency) {
        throw new BadRequestException(
          `${inv.ref} is in ${inv.currency} but this ledger holds ${ledger.currency}`,
        );
      }
      const totals = this.invoiceService.computeTotals(inv);
      const open = totals.payable - (inv.paidAmount ?? 0);
      const committed = await this.committedAgainst(
        tId,
        { linkType: TrustLinkType.INVOICE, linkId: inv._id },
        excludeId,
      );
      const available = round2(open - committed);
      if (p.amount > available + 0.005) {
        throw new BadRequestException(
          `${inv.ref} only has ${fmt(Math.max(available, 0), ledger.currency)} left to pay (outstanding ${fmt(open, ledger.currency)}, ${fmt(committed, ledger.currency)} already drawn or pending)`,
        );
      }
      out.linkType = TrustLinkType.INVOICE;
      out.linkId = inv._id;
      out.linkRef = inv.ref;
      out.linkLabel = `${inv.ref} — ${inv.mandateName}`;
      out.payeeName = out.payeeName || 'Office account (fees)';
      const office = await this.resolveOfficeAccount(
        tId,
        ledger.currency,
        p.officeBankAccountId,
      );
      out.officeBankAccountId = office._id as Types.ObjectId;
    } else if (p.drawdownType === TrustDrawdownType.MANDATE) {
      const mandateId =
        p.mandateId || (ledger.mandateId && String(ledger.mandateId));
      if (!mandateId) {
        throw new BadRequestException(
          'Select the mandate this drawdown is made under',
        );
      }
      const m: any = await this.mandateService.getById(tenantId, mandateId);
      if (String(m.clientUserId) !== String(ledger.clientUserId)) {
        throw new BadRequestException(
          'That mandate belongs to a different client',
        );
      }
      if (m.currency === ledger.currency && m.budget > 0) {
        const committed = await this.committedAgainst(
          tId,
          {
            linkType: TrustLinkType.MANDATE,
            linkId: new Types.ObjectId(String(m._id)),
          },
          excludeId,
        );
        const remaining = round2(m.budget - committed);
        if (p.amount > remaining + 0.005) {
          throw new BadRequestException(
            `${m.ref} has ${fmt(Math.max(remaining, 0), ledger.currency)} of its ${fmt(m.budget, ledger.currency)} budget left`,
          );
        }
      }
      out.linkType = TrustLinkType.MANDATE;
      out.linkId = new Types.ObjectId(String(m._id));
      out.linkRef = m.ref;
      out.linkLabel = `${m.ref} — ${m.name}`;
      if (!out.payeeName?.trim()) {
        throw new BadRequestException(
          'Who is being paid? Enter the payee name',
        );
      }
    } else if (p.drawdownType === TrustDrawdownType.THIRD_PARTY) {
      if (!out.payeeName?.trim() && !p.linkedBillId) {
        throw new BadRequestException(
          'Who is being paid? Enter the payee name',
        );
      }
      if (!p.linkedBillId && !p.hasDocuments) {
        throw new BadRequestException(
          'A third-party disbursement needs its source document — link the bill, or attach the invoice / receipt',
        );
      }
      if (p.linkedBillId) {
        const b: any = await this.billModel
          .findOne({ _id: p.linkedBillId, tenantId: tId })
          .lean();
        if (!b) throw new NotFoundException('Bill not found');
        if ([BillStatus.PAID, BillStatus.REJECTED].includes(b.status)) {
          throw new BadRequestException(
            `${b.ref} is ${b.status} — it cannot be paid again from trust`,
          );
        }
        if (b.currency !== ledger.currency) {
          throw new BadRequestException(
            `${b.ref} is in ${b.currency} but this ledger holds ${ledger.currency}`,
          );
        }
        const committed = await this.committedAgainst(
          tId,
          { linkType: TrustLinkType.BILL, linkId: b._id },
          excludeId,
        );
        const available = round2(b.amount - committed);
        if (p.amount > available + 0.005) {
          throw new BadRequestException(
            `${b.ref} only has ${fmt(Math.max(available, 0), ledger.currency)} left to pay (bill ${fmt(b.amount, ledger.currency)}, ${fmt(committed, ledger.currency)} already drawn or pending)`,
          );
        }
        out.linkType = TrustLinkType.BILL;
        out.linkId = b._id;
        out.linkRef = b.ref;
        out.linkLabel = `${b.ref} — ${b.vendorName}`;
        out.payeeName = out.payeeName || b.vendorName;
      }
    } else if (p.drawdownType === TrustDrawdownType.REFUND) {
      if (!p.linkedDepositId) {
        throw new BadRequestException(
          'Select the deposit being refunded — a refund has to trace back to the money that came in',
        );
      }
      const dep: any = await this.model
        .findOne({
          _id: p.linkedDepositId,
          tenantId: tId,
          ledgerId: new Types.ObjectId(String(ledger._id)),
          type: TrustMovementType.DEPOSIT,
          status: TrustMovementStatus.RECORDED,
        })
        .lean();
      if (!dep) {
        throw new NotFoundException('That deposit is not on this ledger');
      }
      const refunded = await this.committedAgainst(
        tId,
        {
          drawdownType: TrustDrawdownType.REFUND,
          linkType: TrustLinkType.DEPOSIT,
          linkId: dep._id,
        },
        excludeId,
      );
      const available = round2(dep.amount - refunded);
      if (p.amount > available + 0.005) {
        throw new BadRequestException(
          `Only ${fmt(Math.max(available, 0), ledger.currency)} of deposit ${dep.ref} can still be refunded`,
        );
      }
      out.linkType = TrustLinkType.DEPOSIT;
      out.linkId = dep._id;
      out.linkRef = dep.ref;
      out.linkLabel = `${dep.ref} — ${dep.reference}`;
      out.payeeName = out.payeeName || ledger.clientName;
    }
    return out;
  }

  // No-overdraw enforcement at request time — a client can never
  // even be asked to draw down more than they genuinely have free,
  // before an authoriser ever sees it. "Free" is the balance less
  // every drawdown already waiting for authorisation.
  async requestDrawdown(
    tenantId: string,
    dto: RequestTrustDrawdownDto,
    files: TrustUploadedFile[],
    actor: TrustActor,
  ) {
    const discard = () => files.forEach((f) => this.removeFile(f.path));
    try {
      const ledger = await this.getLedgerRaw(tenantId, dto.ledgerId);
      if (!dto.narrative?.trim()) {
        throw new BadRequestException(
          'State the purpose of the drawdown — it is part of the record',
        );
      }
      const link = await this.validateDrawdown(tenantId, ledger, {
        ...dto,
        hasDocuments: files.length > 0,
      });
      if (!dto.saveAsDraft && dto.amount > ledger.available + 0.005) {
        throw new BadRequestException(
          `Drawdown of ${fmt(dto.amount, ledger.currency)} exceeds the ${fmt(ledger.available, ledger.currency)} actually free in this ledger (balance ${fmt(ledger.balance, ledger.currency)}, ${fmt(ledger.reserved, ledger.currency)} already awaiting authorisation)`,
        );
      }
      const needsSecond =
        ledger.maxDrawdownPerRequest > 0 &&
        dto.amount > ledger.maxDrawdownPerRequest;
      const tId = new Types.ObjectId(tenantId);
      const ref = await this.nextRef(tId);
      const isOffice =
        dto.drawdownType === TrustDrawdownType.INVOICE ||
        dto.drawdownType === TrustDrawdownType.TRUST_TO_OFFICE;
      const created = await this.model.create({
        tenantId: tId,
        ref,
        ledgerId: new Types.ObjectId(dto.ledgerId),
        type: TrustMovementType.DRAWDOWN,
        drawdownType: dto.drawdownType,
        amount: dto.amount,
        currency: ledger.currency,
        reference: link.linkRef
          ? `${dto.drawdownType} ${link.linkRef}`
          : dto.drawdownType,
        date: new Date(),
        status: dto.saveAsDraft
          ? TrustMovementStatus.DRAFT
          : TrustMovementStatus.AWAITING_AUTHORISATION,
        preparedBy: actor.name,
        preparedById: actor.id,
        linkType: link.linkType,
        linkId: link.linkId,
        linkRef: link.linkRef,
        linkLabel: link.linkLabel,
        linkedInvoiceId:
          link.linkType === TrustLinkType.INVOICE ? link.linkId : null,
        payeeName: link.payeeName,
        expenseCategory: dto.expenseCategory ?? '',
        paymentMethod:
          dto.paymentMethod ??
          (isOffice
            ? 'Internal transfer (trust-to-office)'
            : 'Bank transfer (EFT)'),
        beneficiaryAccount: dto.beneficiaryAccount ?? '',
        officeBankAccountId: link.officeBankAccountId,
        requestedDate: dto.requestedDate ? new Date(dto.requestedDate) : null,
        narrative: dto.narrative,
        internalNotes: dto.internalNotes ?? '',
        requiresAdditionalApproval: needsSecond,
        documents: toDocs(files),
      });
      await this.audit.log(tenantId, {
        action: dto.saveAsDraft
          ? TrustAuditAction.DRAWDOWN_DRAFTED
          : TrustAuditAction.DRAWDOWN_PREPARED,
        ledger,
        movementId: created._id,
        details: `${ref} · ${dto.drawdownType}${link.linkLabel ? ` · ${link.linkLabel}` : ''} · to ${link.payeeName || '—'}${needsSecond ? ' · above per-request limit: two authorisers required' : ''}`,
        amount: dto.amount,
        currency: ledger.currency,
        actor,
      });
      return created.toObject();
    } catch (e) {
      discard();
      throw e;
    }
  }

  // A draft becomes a real request only after passing every check
  // again — documents, source document, free balance.
  async submitDraft(tenantId: string, movementId: string, actor: TrustActor) {
    const m = await this.getDoc(tenantId, movementId);
    if (m.status !== TrustMovementStatus.DRAFT) {
      throw new BadRequestException('Only a draft can be submitted');
    }
    const ledger = await this.getLedgerRaw(tenantId, String(m.ledgerId));
    await this.validateDrawdown(
      tenantId,
      ledger,
      {
        drawdownType: m.drawdownType as TrustDrawdownType,
        amount: m.amount,
        linkedInvoiceId:
          m.linkType === TrustLinkType.INVOICE ? String(m.linkId) : null,
        linkedBillId:
          m.linkType === TrustLinkType.BILL ? String(m.linkId) : null,
        mandateId:
          m.linkType === TrustLinkType.MANDATE ? String(m.linkId) : null,
        linkedDepositId:
          m.linkType === TrustLinkType.DEPOSIT ? String(m.linkId) : null,
        payeeName: m.payeeName,
        officeBankAccountId: m.officeBankAccountId
          ? String(m.officeBankAccountId)
          : null,
        hasDocuments: (m.documents?.length ?? 0) > 0,
      },
      m._id,
    );
    if (m.amount > ledger.available + 0.005) {
      throw new BadRequestException(
        `Only ${fmt(ledger.available, ledger.currency)} is free in this ledger right now`,
      );
    }
    m.status = TrustMovementStatus.AWAITING_AUTHORISATION;
    m.preparedBy = actor.name;
    m.preparedById = actor.id;
    m.date = new Date();
    await m.save();
    await this.audit.log(tenantId, {
      action: TrustAuditAction.DRAWDOWN_PREPARED,
      ledger,
      movementId: m._id,
      details: `${m.ref} submitted for approval (from draft)`,
      amount: m.amount,
      currency: ledger.currency,
      actor,
    });
    return m.toObject();
  }

  // Evidence can be added to a movement after the fact — a receipt
  // that arrives later, a countersigned engagement letter. It is
  // appended, never replaced, and logged.
  async addDocuments(
    tenantId: string,
    movementId: string,
    files: TrustUploadedFile[],
    actor: TrustActor,
  ) {
    const m = await this.getDoc(tenantId, movementId);
    if (!files.length)
      throw new BadRequestException('Attach at least one file');
    m.documents.push(...(toDocs(files) as any));
    await m.save();
    const ledger = await this.getLedgerRaw(tenantId, String(m.ledgerId));
    await this.audit.log(tenantId, {
      action: TrustAuditAction.DOCUMENT_ATTACHED,
      ledger,
      movementId: m._id,
      details: `${m.ref}: ${files.map((f) => f.originalname).join(', ')}`,
      actor,
    });
    return m.toObject();
  }

  // The real dual-control checkpoint. Re-checks the balance AND the
  // source document here, not just at request time — another
  // drawdown could have been approved in between, or the invoice
  // settled by other means.
  async authoriseDrawdown(
    tenantId: string,
    movementId: string,
    actor: TrustActor,
  ) {
    const m = await this.getDoc(tenantId, movementId);
    if (m.status !== TrustMovementStatus.AWAITING_AUTHORISATION) {
      throw new BadRequestException(
        'This movement is not awaiting authorisation',
      );
    }
    const samePerson = (id?: string | null, name?: string | null) =>
      (id && id === actor.id) ||
      (!id &&
        name &&
        name.trim().toLowerCase() === actor.name.trim().toLowerCase());
    if (samePerson(m.preparedById, m.preparedBy)) {
      throw new BadRequestException(
        'The authoriser must be different from the preparer',
      );
    }
    const ledger = await this.getLedgerRaw(tenantId, String(m.ledgerId));
    // Approved drawdowns have already come off the balance, so what is
    // left is what this one can still take.
    if (m.amount > ledger.balance + 0.005) {
      throw new BadRequestException(
        `Cannot authorise — this would overdraw the client's trust balance (available: ${fmt(ledger.balance, ledger.currency)})`,
      );
    }
    try {
      await this.validateDrawdown(
        tenantId,
        ledger,
        {
          drawdownType: m.drawdownType as TrustDrawdownType,
          amount: m.amount,
          linkedInvoiceId:
            m.linkType === TrustLinkType.INVOICE ? String(m.linkId) : null,
          linkedBillId:
            m.linkType === TrustLinkType.BILL ? String(m.linkId) : null,
          mandateId:
            m.linkType === TrustLinkType.MANDATE ? String(m.linkId) : null,
          linkedDepositId:
            m.linkType === TrustLinkType.DEPOSIT ? String(m.linkId) : null,
          payeeName: m.payeeName,
          officeBankAccountId: m.officeBankAccountId
            ? String(m.officeBankAccountId)
            : null,
          hasDocuments: (m.documents?.length ?? 0) > 0,
        },
        m._id,
      );
    } catch (e: any) {
      throw new BadRequestException(
        `Cannot authorise — the source document no longer supports this drawdown: ${e?.message ?? e}`,
      );
    }

    // Above the ledger's per-request limit: a first authoriser parks
    // it for a second, different one.
    if (m.requiresAdditionalApproval && !m.firstAuthorisedById) {
      m.firstAuthorisedBy = actor.name;
      m.firstAuthorisedById = actor.id;
      m.firstAuthorisedAt = new Date();
      await m.save();
      await this.audit.log(tenantId, {
        action: TrustAuditAction.DRAWDOWN_FIRST_APPROVED,
        ledger,
        movementId: m._id,
        details: `${m.ref}: first of two approvals — above the ${fmt(ledger.maxDrawdownPerRequest, ledger.currency)} per-request limit`,
        amount: m.amount,
        currency: ledger.currency,
        actor,
      });
      return m.toObject();
    }
    if (m.requiresAdditionalApproval && m.firstAuthorisedById === actor.id) {
      throw new BadRequestException(
        'This drawdown needs a second, different authoriser',
      );
    }

    // Fees going to the office: settle the invoice for real — the
    // payment lands in the office bank account and the invoice moves
    // to Part paid / Paid. Done before anything is marked approved, so
    // a failure leaves the drawdown still awaiting.
    let settledPaymentRef = '';
    if (m.linkType === TrustLinkType.INVOICE && m.linkId) {
      const pay: any = await this.paymentService.record(
        tenantId,
        String(m.linkId),
        {
          amount: m.amount,
          method: PaymentMethod.BANK_TRANSFER,
          bankAccountId: m.officeBankAccountId
            ? String(m.officeBankAccountId)
            : undefined,
        },
      );
      settledPaymentRef = pay?.ref ?? '';
    }

    m.status = TrustMovementStatus.APPROVED;
    m.authorisedBy = actor.name;
    m.authorisedById = actor.id;
    m.authorisedAt = new Date();
    m.settledPaymentRef = settledPaymentRef;
    await m.save();

    // Real double-entry — money genuinely leaving the trust
    // account, matched by an equal decrease in what the firm owes
    // this client. Dr Client trust liability, Cr Bank-trust.
    await this.glPostingService.post(
      tenantId,
      [
        {
          date: new Date(),
          ref: m.ref,
          description: `${ledger.clientName} — trust drawdown`,
          accountCode: GL_ACCOUNTS.CLIENT_TRUST_LIABILITY.code,
          accountName: GL_ACCOUNTS.CLIENT_TRUST_LIABILITY.name,
          source: GlSource.TRUST,
          debit: m.amount,
          sourceId: m._id,
        },
        {
          date: new Date(),
          ref: m.ref,
          description: `${ledger.clientName} — trust drawdown`,
          accountCode: GL_ACCOUNTS.BANK_TRUST.code,
          accountName: GL_ACCOUNTS.BANK_TRUST.name,
          source: GlSource.TRUST,
          credit: m.amount,
          sourceId: m._id,
        },
      ],
      ledger.currency,
    );

    await this.audit.log(tenantId, {
      action: TrustAuditAction.DRAWDOWN_APPROVED,
      ledger,
      movementId: m._id,
      details: `${m.ref} · ${m.drawdownType}${m.linkLabel ? ` · ${m.linkLabel}` : ''} · prepared by ${m.preparedBy}${m.firstAuthorisedBy ? `, first approved by ${m.firstAuthorisedBy}` : ''}, approved by ${actor.name}${settledPaymentRef ? ` · invoice payment ${settledPaymentRef}` : ''}`,
      amount: m.amount,
      currency: ledger.currency,
      actor,
    });
    await this.notifier.notify(
      tenantId,
      ledger,
      'drawdownNotices',
      'Drawdown made',
      `${fmt(m.amount, ledger.currency)} was drawn from your trust ledger${m.linkLabel ? ` against ${m.linkLabel}` : ''}${m.payeeName ? `, paid to ${m.payeeName}` : ''}.`,
    );
    await this.checkReplenishment(tenantId, String(m.ledgerId), actor);
    return m.toObject();
  }

  // After money leaves, if the ledger has fallen below its retainer
  // minimum, ask the client to top it up — once per drop, not on
  // every later drawdown.
  private async checkReplenishment(
    tenantId: string,
    ledgerId: string,
    actor: TrustActor,
  ) {
    const l: any = await this.getLedgerRaw(tenantId, ledgerId);
    if (!(l.minBalance > 0) || l.balance >= l.minBalance) return;
    const doc = await this.ledgerModel.findById(ledgerId);
    if (!doc) return;
    const last = doc.lastReplenishmentAt;
    if (last && Date.now() - last.getTime() < 24 * 3600 * 1000) return;
    doc.lastReplenishmentAt = new Date();
    await doc.save();
    const topUp =
      l.replenishmentTarget > 0
        ? Math.max(l.replenishmentTarget - l.balance, 0)
        : l.minBalance - l.balance;
    await this.notifier.notify(
      tenantId,
      l,
      'lowBalanceAlerts',
      'Please top up your trust account',
      `Your trust balance (${fmt(l.balance, l.currency)}) has fallen below the agreed minimum of ${fmt(l.minBalance, l.currency)}. A top-up of ${fmt(topUp, l.currency)} is requested.`,
    );
    await this.audit.log(tenantId, {
      action: TrustAuditAction.REPLENISHMENT_REQUESTED,
      ledger: l,
      details: `Balance ${fmt(l.balance, l.currency)} is below the ${fmt(l.minBalance, l.currency)} minimum — top-up of ${fmt(topUp, l.currency)} requested`,
      amount: topUp,
      currency: l.currency,
      actor,
    });
  }

  // Preparer withdraws a draft, or an authoriser turns a request
  // down. Either way the record stays — nothing in trust is deleted.
  async rejectDrawdown(
    tenantId: string,
    movementId: string,
    reason: string | undefined,
    actor: TrustActor,
  ) {
    const m = await this.getDoc(tenantId, movementId);
    if (
      m.status !== TrustMovementStatus.AWAITING_AUTHORISATION &&
      m.status !== TrustMovementStatus.DRAFT
    ) {
      throw new BadRequestException(
        'This movement is not awaiting authorisation',
      );
    }
    const wasDraft = m.status === TrustMovementStatus.DRAFT;
    m.status = TrustMovementStatus.REJECTED;
    m.rejectedReason = reason?.trim() || (wasDraft ? 'Draft discarded' : null);
    await m.save();
    const ledger = await this.getLedgerRaw(tenantId, String(m.ledgerId));
    await this.audit.log(tenantId, {
      action: TrustAuditAction.DRAWDOWN_REJECTED,
      ledger,
      movementId: m._id,
      details: `${m.ref} ${wasDraft ? 'draft discarded' : 'rejected'}${m.rejectedReason ? ` — ${m.rejectedReason}` : ''}`,
      amount: m.amount,
      currency: ledger.currency,
      actor,
    });
    return m.toObject();
  }

  private removeFile(path?: string | null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      if (path && fs.existsSync(path)) fs.unlinkSync(path);
    } catch {
      /* a stale file on disk is not worth failing the request */
    }
  }
}
