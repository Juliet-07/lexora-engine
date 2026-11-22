import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  AdrCase,
  AdrCaseDocument,
  AdrCaseStatus,
  AdrDocumentEntry,
  AdrDocumentEntryDocument,
  CaseOutcome,
  CaseOutcomeDocument,
  CaseOutcomeKind,
  CaseOutcomeStatus,
  LitigationCase,
  LitigationCaseDocument,
  LitigationCaseStatus,
  LitigationDocumentEntry,
  LitigationDocumentEntryDocument,
  Mandate,
  MandateDocument_,
  OUTCOME_SLUGS,
  OutcomeCaseKind,
} from '../schemas';
import { OutcomeShareDto, SaveCaseOutcomeDto } from '../dtos';
import { User, UserDocument } from '../../../auth/schemas/user.schema';
import { Employee, EmployeeDocument } from 'src/modules/hr/schemas';
import { EmailService } from '../../../../common/utils/mailing/email.service';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';
import {
  CaseOutcomePdfService,
  OutcomeSection,
} from './case-outcome-pdf.service';

// ─────────────────────────────────────────────────────────────
// Option lists. The tenant form offers the same ones; anything else
// is coerced back to a safe default rather than stored.
// ─────────────────────────────────────────────────────────────
const SETTLEMENT_TYPES = [
  'Full and final',
  'Partial',
  'Conditional',
  'Interim',
];
const STRUCTURES = ['Lump sum', 'Instalments', 'On conditions'];
const SETTLEMENT_COSTS = [
  'Each party bears own',
  'Paid by respondent',
  'Shared equally',
];
const NON_MONEY_AWARD = [
  'Mediation ended without settlement',
  'Non-binding recommendation',
  'Claim withdrawn',
];
const NO_RELIEF_JUDGMENT = [
  'Interlocutory order',
  'Claim dismissed',
  'Claim struck out',
];
// Orders that decide part of a case or an interim point leave it open.
const OPEN_JUDGMENT = ['Interlocutory order', 'Partial judgment'];
const CONSENT_COSTS = [
  'Each party bears own',
  'Defendant pays, as taxed',
  'Agreed amount',
];
const ORDER_STATUSES = [
  'Draft agreed',
  'Filed with court',
  'Made by the court',
];
const COMPLIANCE = ['Awaiting', 'Partly', 'Complied'];
const SATISFACTION = ['Unsatisfied', 'Partly', 'Satisfied'];

export const OUTCOME_SHARE_OPTIONS: Record<
  CaseOutcomeKind,
  {
    mainDocument: string;
    documents: string[];
    fileLabel: string;
    fileHint: string;
    fileDone: string;
    subject: string;
    message: string;
  }
> = {
  [CaseOutcomeKind.SETTLEMENT]: {
    mainDocument: 'Settlement Agreement',
    documents: [
      'Settlement Agreement',
      'Settlement terms summary',
      'Payment schedule',
    ],
    fileLabel: 'Notify ADR centre',
    fileHint: 'Logs that the centre or mediator was told',
    fileDone: 'ADR centre notified to close or stay the proceedings',
    subject: 'Settlement',
    message:
      'Please find attached the settlement agreement and payment schedule in the above matter for review and signature. Kindly confirm receipt.',
  },
  [CaseOutcomeKind.AWARD]: {
    mainDocument: 'Award document',
    documents: [
      'Award document',
      'Outcome summary for the client',
      'Compliance and challenge deadlines',
      'Costs statement',
    ],
    fileLabel: 'Notify ADR centre',
    fileHint: 'Logs that receipt was confirmed with the centre',
    fileDone: 'receipt confirmed with the ADR centre',
    subject: 'Award or outcome',
    message:
      'The outcome in the above matter has been recorded. The award and a summary of the key deadlines are attached.',
  },
  [CaseOutcomeKind.CONSENT_JUDGMENT]: {
    mainDocument: 'Consent order',
    documents: [
      'Consent order',
      'Settlement terms summary',
      'Payment schedule',
      'Separate settlement agreement',
    ],
    fileLabel: 'File with court',
    fileHint: 'Logs that the order was filed with the registry',
    fileDone: 'filed with the court registry',
    subject: 'Consent judgment',
    message:
      'Please find attached the consent order and payment schedule in the above matter. Kindly confirm receipt.',
  },
  [CaseOutcomeKind.JUDGMENT]: {
    mainDocument: 'Sealed judgment and order',
    documents: [
      'Sealed judgment and order',
      'Judgment summary for the client',
      'Appeal and payment deadlines',
      'Bill of costs',
    ],
    fileLabel: 'Serve on parties',
    fileHint: 'Logs formal service on the other parties',
    fileDone: 'served on the other parties, proof of service logged',
    subject: 'Judgment delivered',
    message:
      'Judgment was delivered in the above matter. The sealed judgment and a summary of the key deadlines are attached.',
  },
};

// ─────────────────────────────────────────────────────────────
// Small value helpers
// ─────────────────────────────────────────────────────────────
const str = (v: any, max = 4000): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';
const num = (v: any): number => {
  const x = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(x) && x > 0 ? Math.round(x * 100) / 100 : 0;
};
const int = (v: any, max = 3650): number => {
  const x = Math.floor(Number(String(v ?? '').replace(/[^0-9]/g, '')));
  return Number.isFinite(x) ? Math.min(Math.max(x, 0), max) : 0;
};
const bool = (v: any): boolean => v === true || v === 'true';
const day = (v: any): string => {
  const t = typeof v === 'string' ? v.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && !isNaN(Date.parse(t)) ? t : '';
};
const oneOf = (v: any, list: string[], fallback: string): string =>
  list.includes(v) ? v : fallback;
const toDate = (t: string): Date | null =>
  t ? new Date(`${t}T12:00:00.000Z`) : null;
const addDays = (t: string, n: number): string => {
  const d = new Date(`${t}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const todayStr = (): string => new Date().toISOString().slice(0, 10);
const daysFromToday = (t: string): number =>
  Math.round(
    (Date.parse(`${t}T12:00:00Z`) - Date.parse(`${todayStr()}T12:00:00Z`)) /
      86_400_000,
  );
const fmtN = (n: number): string => (Number(n) || 0).toLocaleString('en-GB');
const fmtD = (t: string): string =>
  t
    ? new Date(`${t}T12:00:00Z`).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '';
const money = (n: number, cur: string): string => `${cur} ${fmtN(n)}`;
const first = (label: string): string => label.split(',')[0];
const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

interface Payment {
  dueOn: string;
  amount: number;
  method: string;
  paid: boolean;
  paidOn: string;
}
interface Head {
  label: string;
  amount: number;
}
const payments = (v: any): Payment[] =>
  Array.isArray(v)
    ? v.slice(0, 60).map((p) => ({
        dueOn: day(p?.dueOn),
        amount: num(p?.amount),
        method: str(p?.method, 60) || 'Bank transfer',
        paid: bool(p?.paid),
        paidOn: bool(p?.paid) ? day(p?.paidOn) || todayStr() : '',
      }))
    : [];
const heads = (v: any): Head[] =>
  Array.isArray(v)
    ? v
        .slice(0, 40)
        .map((h) => ({ label: str(h?.label, 160), amount: num(h?.amount) }))
        .filter((h) => h.amount > 0)
    : [];
const sum = (xs: { amount: number }[]): number =>
  Math.round(xs.reduce((s, x) => s + x.amount, 0) * 100) / 100;

const sec = (
  h: string,
  rows: [string, any][] = [],
  tables: OutcomeSection['tables'] = [],
  ticks: string[] = [],
): OutcomeSection => ({
  h,
  rows: rows
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => [k, String(v)] as [string, string]),
  tables,
  ticks,
});
const paymentTable = (ps: Payment[]) => ({
  head: ['#', 'Due date', 'Amount', 'Method', 'Status'],
  rows: ps.map((p, i) => [
    String(i + 1),
    fmtD(p.dueOn),
    fmtN(p.amount),
    p.method,
    p.paid ? `Paid${p.paidOn ? ` on ${fmtD(p.paidOn)}` : ''}` : 'Pending',
  ]),
});
const headTable = (hs: Head[], title: string) => ({
  head: [title, 'Amount'],
  rows: hs.map((h) => [h.label, fmtN(h.amount)]),
});

type Form = Record<string, any>;
interface Derived {
  subtype: string;
  amount: number;
  currency: string;
  summary: string;
  occurredOn: string;
  challengeLast: string;
}

@Injectable()
export class CaseOutcomeService {
  private readonly logger = new Logger(CaseOutcomeService.name);

  constructor(
    @InjectModel(CaseOutcome.name)
    private readonly model: Model<CaseOutcomeDocument>,
    @InjectModel(AdrCase.name)
    private readonly adrModel: Model<AdrCaseDocument>,
    @InjectModel(LitigationCase.name)
    private readonly litModel: Model<LitigationCaseDocument>,
    @InjectModel(AdrDocumentEntry.name)
    private readonly adrDocModel: Model<AdrDocumentEntryDocument>,
    @InjectModel(LitigationDocumentEntry.name)
    private readonly litDocModel: Model<LitigationDocumentEntryDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Mandate.name)
    private readonly mandateModel: Model<MandateDocument_>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly emailService: EmailService,
    private readonly events: EventEmitter2,
    private readonly pdf: CaseOutcomePdfService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // Lookups
  // ═══════════════════════════════════════════════════════════

  private kindFromSlug(caseKind: OutcomeCaseKind, slug: string) {
    const kind = OUTCOME_SLUGS[slug];
    const allowed =
      caseKind === 'adr'
        ? [CaseOutcomeKind.SETTLEMENT, CaseOutcomeKind.AWARD]
        : [CaseOutcomeKind.CONSENT_JUDGMENT, CaseOutcomeKind.JUDGMENT];
    if (!kind || !allowed.includes(kind)) {
      throw new NotFoundException(
        `A ${caseKind === 'adr' ? 'ADR' : 'litigation'} case has no "${slug}" record`,
      );
    }
    return kind;
  }

  private async loadCase(
    caseKind: OutcomeCaseKind,
    tenantId: string,
    id: string,
  ) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Case not found');
    const model: Model<any> =
      caseKind === 'adr' ? this.adrModel : this.litModel;
    const c = await model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Case not found');
    return c as any;
  }

  private docModelFor(caseKind: OutcomeCaseKind): Model<any> {
    return caseKind === 'adr' ? this.adrDocModel : this.litDocModel;
  }

  private async actor(userId: string) {
    const u = await this.userModel
      .findById(userId)
      .select('firstName lastName email')
      .lean();
    const name =
      `${(u as any)?.firstName ?? ''} ${(u as any)?.lastName ?? ''}`.trim() ||
      (u as any)?.email ||
      'Case team';
    return {
      userId: Types.ObjectId.isValid(userId)
        ? new Types.ObjectId(userId)
        : null,
      name,
    };
  }

  private async businessName(tenantId: string): Promise<string> {
    return (await resolveBusinessName(this.userModel, tenantId)) || 'Lexora';
  }

  private caseLabel(caseKind: OutcomeCaseKind, c: any): string {
    return caseKind === 'adr'
      ? `${c.title} · ${c.type}${c.venue ? ` (${c.venue})` : ''}`
      : `${c.title} · ${c.court || 'Court not set'}${c.courtCaseNumber ? ` · ${c.courtCaseNumber}` : ''}`;
  }

  /** Staff to tell: the account owner and everyone on the case's team. */
  private async teamUserIds(tenantId: string, c: any, exceptUserId?: string) {
    const ids = new Set<string>([tenantId]);
    if (c.teamId) {
      const staff = await this.employeeModel
        .find({ tenantId: new Types.ObjectId(tenantId), teamId: c.teamId })
        .select('userId')
        .lean();
      staff.forEach((e: any) => e.userId && ids.add(String(e.userId)));
    }
    if (exceptUserId) ids.delete(exceptUserId);
    return [...ids];
  }

  private async clientOf(c: any) {
    if (!c.mandateId) return null;
    const m = await this.mandateModel
      .findById(c.mandateId)
      .select('clientUserId clientName')
      .lean();
    if (!m) return null;
    const u = await this.userModel
      .findById((m as any).clientUserId)
      .select('email')
      .lean();
    return {
      userId: String((m as any).clientUserId),
      name: (m as any).clientName as string,
      email: ((u as any)?.email as string) || '',
    };
  }

  // A document the tenant picked must really be filed on this case.
  private async resolveDocument(
    caseKind: OutcomeCaseKind,
    tenantId: string,
    caseId: string,
    id: any,
  ) {
    if (!id) return null;
    if (!Types.ObjectId.isValid(String(id))) {
      throw new BadRequestException(
        'That document does not exist on this case',
      );
    }
    const d = await this.docModelFor(caseKind)
      .findOne({
        _id: id,
        tenantId: new Types.ObjectId(tenantId),
        caseId: new Types.ObjectId(caseId),
      })
      .lean();
    if (!d) {
      throw new BadRequestException(
        "That document isn't filed on this case's Documents tab",
      );
    }
    return d as any;
  }

  // ═══════════════════════════════════════════════════════════
  // Normalising the form
  // ═══════════════════════════════════════════════════════════

  private authorityFields(f: Form, prev: Form | undefined) {
    const authority = str(f.authority, 120);
    const authorityOn =
      authority && prev?.authority === authority && prev?.authorityOn
        ? prev.authorityOn
        : authority
          ? todayStr()
          : '';
    return { authority, authorityOn };
  }

  private normalise(
    kind: CaseOutcomeKind,
    f: Form,
    prev: Form | undefined,
    c: any,
  ): Form {
    f = f && typeof f === 'object' ? f : {};
    const currency = str(f.currency, 6).toUpperCase() || c.currency || 'USD';
    const docId = Types.ObjectId.isValid(String(f.documentId ?? ''))
      ? String(f.documentId)
      : '';
    switch (kind) {
      case CaseOutcomeKind.SETTLEMENT:
        return {
          type: oneOf(f.type, SETTLEMENT_TYPES, 'Full and final'),
          amount: num(f.amount),
          currency,
          payer: str(f.payer, 200),
          payee: str(f.payee, 200),
          agreedOn: day(f.agreedOn),
          reachedVia: str(f.reachedVia, 120),
          conditions: str(f.conditions),
          nonMonetary: str(f.nonMonetary),
          structure: oneOf(f.structure, STRUCTURES, 'Instalments'),
          payments: payments(f.payments),
          interest: str(f.interest, 200),
          defaultConsequence: str(f.defaultConsequence, 200),
          mutualRelease: bool(f.mutualRelease),
          noAdmission: bool(f.noAdmission),
          confidential: bool(f.confidential),
          consentAward: bool(f.consentAward),
          costs: oneOf(f.costs, SETTLEMENT_COSTS, SETTLEMENT_COSTS[0]),
          documentId: docId,
          ...this.authorityFields(f, prev),
          effect: str(f.effect, 120),
          statusAfter:
            str(f.statusAfter, 120) || 'Settled, monitoring payments',
          remind: bool(f.remind),
        };
      case CaseOutcomeKind.AWARD: {
        const type = str(f.type, 120) || 'Final arbitral award';
        const recv = day(f.receivedOn);
        const days = int(f.challengeDays);
        return {
          type,
          outcomeDate: day(f.outcomeDate),
          receivedOn: recv,
          neutral: str(f.neutral, 200),
          reference: str(f.reference, 120),
          favour: oneOf(
            f.favour,
            ['Claimant', 'Respondent', 'Split', 'Neither'],
            'Claimant',
          ),
          summary: str(f.summary),
          currency,
          payer: str(f.payer, 200),
          heads: heads(f.heads),
          interestRate: str(f.interestRate, 120),
          interestFrom: day(f.interestFrom),
          nonMonetary: str(f.nonMonetary),
          dueOn: day(f.dueOn),
          compliance: oneOf(f.compliance, COMPLIANCE, 'Awaiting'),
          remind: bool(f.remind),
          challengeDays: days,
          challengeLast:
            recv && !NON_MONEY_AWARD.includes(type) ? addDays(recv, days) : '',
          intendsToChallenge: bool(f.intendsToChallenge),
          enforceAbroad: bool(f.enforceAbroad),
          enforceCountry: bool(f.enforceAbroad)
            ? str(f.enforceCountry, 160)
            : '',
          documentId: docId,
          nextStep: str(f.nextStep, 120),
          statusAfter:
            str(f.statusAfter, 120) || 'Award issued, monitoring compliance',
          notify: bool(f.notify),
        };
      }
      case CaseOutcomeKind.CONSENT_JUDGMENT:
        return {
          court: str(f.court, 160) || c.court || '',
          caseNumber: str(f.caseNumber, 120) || c.courtCaseNumber || '',
          judge: str(f.judge, 160),
          orderDate: day(f.orderDate),
          orderStatus: oneOf(f.orderStatus, ORDER_STATUSES, 'Filed with court'),
          amount: num(f.amount),
          currency,
          payer: str(f.payer, 200),
          payee: str(f.payee, 200),
          terms: str(f.terms),
          fullAndFinal: bool(f.fullAndFinal),
          noAdmission: bool(f.noAdmission),
          separateAgreement: bool(f.separateAgreement),
          structure: oneOf(
            f.structure,
            ['Lump sum', 'Instalments'],
            'Instalments',
          ),
          payments: payments(f.payments),
          interest: str(f.interest, 200),
          onDefault: str(f.onDefault, 200),
          costs: oneOf(f.costs, CONSENT_COSTS, CONSENT_COSTS[0]),
          costsAmount: num(f.costsAmount),
          ...this.authorityFields(f, prev),
          documentId: docId,
          statusAfter:
            str(f.statusAfter, 120) || 'Closed by consent, monitoring payments',
          related: str(f.related, 120),
          remind: bool(f.remind),
          notify: bool(f.notify),
        };
      case CaseOutcomeKind.JUDGMENT: {
        const type = str(f.type, 120) || 'Final judgment after trial';
        const recv = day(f.receivedOn);
        const days = int(f.appealDays);
        const noRelief = NO_RELIEF_JUDGMENT.includes(type);
        return {
          type,
          court: str(f.court, 160) || c.court || '',
          judge: str(f.judge, 160),
          caseNumber: str(f.caseNumber, 120) || c.courtCaseNumber || '',
          deliveredOn: day(f.deliveredOn),
          receivedOn: recv,
          favour: oneOf(
            f.favour,
            ['Plaintiff', 'Defendant', 'Partly each'],
            'Plaintiff',
          ),
          result: oneOf(
            f.result,
            ['Upheld in full', 'Upheld in part', 'Dismissed'],
            'Upheld in full',
          ),
          summary: str(f.summary),
          currency,
          debtor: str(f.debtor, 200),
          heads: noRelief ? [] : heads(f.heads),
          interestRate: str(f.interestRate, 200),
          costsOrder: str(f.costsOrder, 160),
          nonMonetary: str(f.nonMonetary),
          appealDays: days,
          challengeLast: recv ? addDays(recv, days) : '',
          leaveRequired: bool(f.leaveRequired),
          intendsToAppeal: bool(f.intendsToAppeal),
          stay: bool(f.stay),
          dueOn: noRelief ? '' : day(f.dueOn),
          satisfaction: oneOf(f.satisfaction, SATISFACTION, 'Unsatisfied'),
          enforcementMethod: noRelief ? '' : str(f.enforcementMethod, 200),
          enforceAbroad: !noRelief && bool(f.enforceAbroad),
          enforceCountry:
            !noRelief && bool(f.enforceAbroad)
              ? str(f.enforceCountry, 160)
              : '',
          documentId: docId,
          nextStep: str(f.nextStep, 120),
          statusAfter:
            str(f.statusAfter, 120) ||
            'Judgment delivered, awaiting satisfaction',
          remind: bool(f.remind),
          notify: bool(f.notify),
        };
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Validation — only enforced when a record is actually recorded;
  // a draft can be saved half-finished.
  // ═══════════════════════════════════════════════════════════

  private scheduleErrors(f: Form, amount: number): string[] {
    const errs: string[] = [];
    const ps: Payment[] = f.payments ?? [];
    if (amount && !ps.length)
      errs.push('Add at least one payment to the schedule.');
    const bal = Math.round((amount - sum(ps)) * 100) / 100;
    if (amount && ps.length && bal !== 0) {
      errs.push(
        `The payment schedule does not match the settlement amount (balance ${money(bal, f.currency)}).`,
      );
    }
    if (amount && ps.some((p) => !p.dueOn))
      errs.push('Add a due date for every payment.');
    if (amount && ps.some((p) => !p.amount))
      errs.push('Enter an amount for every payment.');
    return errs;
  }

  private validate(kind: CaseOutcomeKind, f: Form): string[] {
    const errs: string[] = [];
    switch (kind) {
      case CaseOutcomeKind.SETTLEMENT:
        if (!f.agreedOn) errs.push('Enter the date the settlement was agreed.');
        if (!f.amount) errs.push('Enter the settlement amount.');
        if (f.payer && f.payer === f.payee)
          errs.push('The paying and receiving party must be different.');
        errs.push(...this.scheduleErrors(f, f.amount));
        if (f.type === 'Conditional' && !f.conditions)
          errs.push('Describe the conditions that must be met.');
        if (!f.authority)
          errs.push('Confirm the client’s authority to settle.');
        break;
      case CaseOutcomeKind.AWARD: {
        const nm = NON_MONEY_AWARD.includes(f.type);
        if (!f.outcomeDate)
          errs.push('Enter the date of the award or outcome.');
        if (
          !nm &&
          f.type !== 'Claim dismissed' &&
          !sum(f.heads) &&
          !f.nonMonetary
        )
          errs.push('Enter the amounts awarded or the non-monetary relief.');
        if (!nm && !f.receivedOn)
          errs.push(
            'Enter the date the award was received, to work out the challenge deadline.',
          );
        if (!nm && !f.documentId)
          errs.push('Attach the signed award or decision.');
        if (f.enforceAbroad && !f.enforceCountry)
          errs.push('Enter the country of enforcement.');
        break;
      }
      case CaseOutcomeKind.CONSENT_JUDGMENT:
        if (!f.orderDate) errs.push('Enter the date of the consent order.');
        if (!f.amount && !f.terms)
          errs.push('Enter the settlement amount or the terms to be recorded.');
        if (f.payer && f.payer === f.payee)
          errs.push('The paying and receiving party must be different.');
        errs.push(...this.scheduleErrors(f, f.amount));
        if (f.costs === 'Agreed amount' && !f.costsAmount)
          errs.push('Enter the agreed costs amount.');
        if (!f.authority)
          errs.push('Confirm the client’s authority to settle.');
        if (!f.documentId) errs.push('Generate or attach the consent order.');
        break;
      case CaseOutcomeKind.JUDGMENT: {
        const nr = NO_RELIEF_JUDGMENT.includes(f.type);
        if (!f.deliveredOn)
          errs.push('Enter the date the judgment was delivered.');
        if (!f.receivedOn)
          errs.push(
            'Enter the date the sealed judgment was received, to work out the appeal deadline.',
          );
        if (!nr && !sum(f.heads) && !f.nonMonetary)
          errs.push('Enter the judgment sum or the non-monetary relief.');
        if (!f.documentId) errs.push('Attach the sealed judgment or order.');
        if (f.enforceAbroad && !f.enforceCountry)
          errs.push('Enter the country of enforcement.');
        break;
      }
    }
    return errs;
  }

  // ═══════════════════════════════════════════════════════════
  // What a record derives from its form
  // ═══════════════════════════════════════════════════════════

  private derive(kind: CaseOutcomeKind, f: Form): Derived {
    const cur = f.currency;
    switch (kind) {
      case CaseOutcomeKind.SETTLEMENT:
        return {
          subtype: f.type,
          amount: f.amount,
          currency: cur,
          summary: `${money(f.amount, cur)} · ${f.payments.length} payment${f.payments.length === 1 ? '' : 's'}`,
          occurredOn: f.agreedOn,
          challengeLast: '',
        };
      case CaseOutcomeKind.AWARD: {
        const nm = NON_MONEY_AWARD.includes(f.type);
        const total = nm ? 0 : sum(f.heads);
        return {
          subtype: f.type,
          amount: total,
          currency: cur,
          summary: nm || !total ? f.type : money(total, cur),
          occurredOn: f.outcomeDate,
          challengeLast: f.challengeLast,
        };
      }
      case CaseOutcomeKind.CONSENT_JUDGMENT:
        return {
          subtype: 'Consent judgment',
          amount: f.amount,
          currency: cur,
          summary: `${f.amount ? money(f.amount, cur) : 'Terms recorded'} · ${lower(f.orderStatus)}`,
          occurredOn: f.orderDate,
          challengeLast: '',
        };
      case CaseOutcomeKind.JUDGMENT: {
        const nr = NO_RELIEF_JUDGMENT.includes(f.type);
        const total = nr ? 0 : sum(f.heads);
        return {
          subtype: f.type,
          amount: total,
          currency: cur,
          summary:
            nr || !total
              ? f.result
              : `${money(total, cur)} · appeal by ${fmtD(f.challengeLast)}`,
          occurredOn: f.deliveredOn,
          challengeLast: f.challengeLast,
        };
      }
    }
  }

  /** Dated things still to happen, worked out from the live record. */
  private deadlines(o: any) {
    if (o.status !== CaseOutcomeStatus.RECORDED) return [];
    const f: Form = o.form ?? {};
    const out: { label: string; date: string; kind: string; index?: number }[] =
      [];
    const push = (
      label: string,
      date: string,
      kind: string,
      index?: number,
    ) => {
      if (date) out.push({ label, date, kind, index });
    };
    switch (o.kind) {
      case CaseOutcomeKind.SETTLEMENT:
      case CaseOutcomeKind.CONSENT_JUDGMENT:
        (f.payments ?? []).forEach((p: Payment, i: number) => {
          if (!p.paid)
            push(
              (f.payments.length > 1 ? `Instalment ${i + 1}` : 'Payment') +
                ' due',
              p.dueOn,
              'payment',
              i,
            );
        });
        break;
      case CaseOutcomeKind.AWARD:
        if (!NON_MONEY_AWARD.includes(f.type)) {
          push('Last day to challenge', f.challengeLast, 'challenge');
          if (f.compliance !== 'Complied')
            push('Payment or compliance deadline', f.dueOn, 'compliance');
        }
        break;
      case CaseOutcomeKind.JUDGMENT:
        push('Last day to appeal', f.challengeLast, 'challenge');
        if (f.satisfaction !== 'Satisfied')
          push('Payment or compliance due', f.dueOn, 'compliance');
        break;
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  // ═══════════════════════════════════════════════════════════
  // The record as sections — drives both "View record" and the PDF
  // ═══════════════════════════════════════════════════════════

  private sections(
    kind: CaseOutcomeKind,
    f: Form,
    c: any,
    docName: string,
  ): OutcomeSection[] {
    const cur = f.currency;
    const claim = Number(c.claimValue) || 0;
    const pct = (n: number) =>
      claim && n ? `${Math.round((n / claim) * 100)}% of claim` : '';
    const ps: Payment[] = f.payments ?? [];
    const totals = (amount: number) => {
      const t = sum(ps);
      return `Total ${money(t, cur)} · Balance ${money(Math.round((amount - t) * 100) / 100, cur)}`;
    };
    const authority = f.authority
      ? `${f.authority}, ${fmtD(f.authorityOn)}`
      : 'Not yet confirmed';
    const ticks = (pairs: [boolean, string][]) =>
      pairs.filter(([on]) => on).map(([, t]) => t);

    switch (kind) {
      case CaseOutcomeKind.SETTLEMENT:
        return [
          sec('Settlement terms', [
            ['Settlement type', f.type],
            ['Settlement amount', f.amount ? money(f.amount, cur) : ''],
            ['Against claim', pct(f.amount)],
            ['Paying party', f.payer],
            ['Receiving party', f.payee],
            ['Date agreed', fmtD(f.agreedOn)],
            ['Reached through', f.reachedVia],
            [
              'Conditions to be met',
              f.type === 'Conditional' ? f.conditions : '',
            ],
            ['Non-monetary terms', f.nonMonetary],
          ]),
          sec(
            'Payment schedule',
            [
              ['Payment structure', f.structure],
              ['Totals', ps.length ? totals(f.amount) : ''],
              ['Late payment interest', f.interest],
              ['Default consequence', f.defaultConsequence],
            ],
            ps.length ? [paymentTable(ps)] : [],
          ),
          sec(
            'Scope and protections',
            [['Costs', f.costs]],
            [],
            ticks([
              [f.mutualRelease, 'Mutual release of all claims in this dispute'],
              [f.noAdmission, 'No admission of liability'],
              [f.confidential, 'Settlement terms confidential'],
              [
                f.consentAward,
                'Withdrawal of proceedings or consent award required',
              ],
            ]),
          ),
          sec('Agreement and signing', [
            ['Settlement Agreement', docName || 'Not generated'],
            ['Client authority to settle', authority],
          ]),
          sec(
            'Close-out',
            [
              ['Effect on proceedings', f.effect],
              ['Case status after saving', f.statusAfter],
            ],
            [],
            ticks([
              [
                f.remind,
                'Remind the team 3 days before each instalment is due',
              ],
            ]),
          ),
        ];
      case CaseOutcomeKind.AWARD: {
        const nm = NON_MONEY_AWARD.includes(f.type);
        return [
          sec('Outcome', [
            ['Outcome type', f.type],
            ['Date of award or outcome', fmtD(f.outcomeDate)],
            ['Date received by us', fmtD(f.receivedOn)],
            ['Tribunal, expert or neutral', f.neutral],
            ['Award reference', f.reference],
            ['In favour of', f.favour],
            ['Summary of findings', f.summary],
          ]),
          ...(nm
            ? []
            : [
                sec(
                  'Monetary relief',
                  [
                    ['Currency', cur],
                    ['Payable by', f.payer],
                    [
                      'Totals',
                      `Total awarded ${money(sum(f.heads), cur)}${pct(sum(f.heads)) ? ' · ' + pct(sum(f.heads)) : ''}`,
                    ],
                    ['Post-award interest rate', f.interestRate],
                    ['Interest runs from', fmtD(f.interestFrom)],
                    ['Non-monetary relief', f.nonMonetary],
                  ],
                  f.heads.length ? [headTable(f.heads, 'Head of award')] : [],
                ),
                sec(
                  'Compliance',
                  [
                    ['Payment or compliance deadline', fmtD(f.dueOn)],
                    ['Compliance status', f.compliance],
                  ],
                  [],
                  ticks([
                    [
                      f.remind,
                      'Remind the team 7 days before the compliance deadline',
                    ],
                  ]),
                ),
                sec(
                  'Challenge and enforcement',
                  [
                    [
                      'Challenge or set-aside period (days)',
                      String(f.challengeDays),
                    ],
                    ['Last day to challenge', fmtD(f.challengeLast)],
                    ['Country of enforcement', f.enforceCountry],
                  ],
                  [],
                  ticks([
                    [
                      f.intendsToChallenge,
                      'Our client intends to challenge or appeal',
                    ],
                    [
                      f.enforceAbroad,
                      'Recognition or enforcement needed in another country',
                    ],
                  ]),
                ),
              ]),
          sec('Award document and close-out', [
            ['Award document', docName || 'No file attached'],
            ['Next step', f.nextStep],
            ['Case status after saving', f.statusAfter],
          ]),
        ];
      }
      case CaseOutcomeKind.CONSENT_JUDGMENT:
        return [
          sec('Court order', [
            ['Court', f.court],
            ['Case number', f.caseNumber],
            ['Judge', f.judge],
            ['Date of consent order', fmtD(f.orderDate)],
            ['Order status', f.orderStatus],
          ]),
          sec(
            'Settlement terms',
            [
              ['Settlement amount', f.amount ? money(f.amount, cur) : ''],
              ['Against claim', pct(f.amount)],
              ['Paying party', f.payer],
              ['Receiving party', f.payee],
              ['Terms of settlement to be recorded in the order', f.terms],
            ],
            [],
            ticks([
              [
                f.fullAndFinal,
                'Full and final settlement of the claim and any counterclaim',
              ],
              [f.noAdmission, 'No admission of liability'],
              [
                f.separateAgreement,
                'Confidential terms kept in a separate settlement agreement',
              ],
            ]),
          ),
          ...(f.amount
            ? [
                sec(
                  'Payment schedule',
                  [
                    ['Payment structure', f.structure],
                    ['Totals', totals(f.amount)],
                    ['Interest on late payment', f.interest],
                    ['On default', f.onDefault],
                  ],
                  ps.length ? [paymentTable(ps)] : [],
                ),
              ]
            : []),
          sec('Costs and authority', [
            ['Costs', f.costs],
            [
              'Agreed costs amount',
              f.costs === 'Agreed amount' ? money(f.costsAmount, cur) : '',
            ],
            ['Client authority to settle', authority],
            ['Consent order', docName || 'Not attached'],
          ]),
          sec(
            'Close-out',
            [
              ['Case status after saving', f.statusAfter],
              ['Related proceedings', f.related],
            ],
            [],
            ticks([
              [
                f.remind,
                'Remind the team 3 days before each instalment is due',
              ],
              [f.notify, 'Notify the client and record in the audit trail'],
            ]),
          ),
        ];
      case CaseOutcomeKind.JUDGMENT: {
        const nr = NO_RELIEF_JUDGMENT.includes(f.type);
        return [
          sec('Judgment', [
            ['Type of judgment', f.type],
            ['Court level', f.court],
            ['Judge or panel', f.judge],
            ['Case number', f.caseNumber],
            ['Date delivered', fmtD(f.deliveredOn)],
            ['Date sealed judgment received', fmtD(f.receivedOn)],
            ['In favour of', f.favour],
            ['Result on the claim', f.result],
            ['Summary of reasons', f.summary],
          ]),
          ...(nr
            ? []
            : [
                sec(
                  'Relief granted',
                  [
                    ['Currency', cur],
                    ['Judgment debtor', f.debtor],
                    [
                      'Totals',
                      `Judgment sum ${money(sum(f.heads), cur)}${pct(sum(f.heads)) ? ' · ' + pct(sum(f.heads)) : ''}`,
                    ],
                    ['Post-judgment interest', f.interestRate],
                    ['Costs order', f.costsOrder],
                    ['Non-monetary relief', f.nonMonetary],
                  ],
                  f.heads.length
                    ? [headTable(f.heads, 'Head of judgment')]
                    : [],
                ),
              ]),
          sec(
            'Appeal',
            [
              ['Appeal period (days)', String(f.appealDays)],
              ['Last day to appeal', fmtD(f.challengeLast)],
            ],
            [],
            ticks([
              [f.leaveRequired, 'Leave to appeal required'],
              [f.intendsToAppeal, 'Our client intends to appeal'],
              [f.stay, 'Stay of execution sought or granted'],
            ]),
          ),
          ...(nr
            ? []
            : [
                sec('Satisfaction and enforcement', [
                  ['Date for payment or compliance', fmtD(f.dueOn)],
                  ['Satisfaction status', f.satisfaction],
                  ['Enforcement method if unpaid', f.enforcementMethod],
                  ['Country of enforcement', f.enforceCountry],
                ]),
              ]),
          sec(
            'Judgment document and close-out',
            [
              ['Sealed judgment and order', docName || 'No file attached'],
              ['Next step', f.nextStep],
              ['Case status after saving', f.statusAfter],
            ],
            [],
            ticks([
              [
                f.remind,
                'Remind the team 7 days before the appeal and payment deadlines',
              ],
              [f.notify, 'Notify the client and record in the audit trail'],
            ]),
          ),
        ];
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Presenting a record to the app
  // ═══════════════════════════════════════════════════════════

  private present(o: any, c: any) {
    const obj = typeof o.toObject === 'function' ? o.toObject() : o;
    const { revisions, remindersSent, ...rest } = obj;
    return {
      ...rest,
      revisionCount: (revisions ?? []).length,
      sections: this.sections(
        obj.kind,
        obj.form ?? {},
        c,
        obj.documentName ?? '',
      ),
      deadlines: this.deadlines(obj),
    };
  }

  // `present` plus the main document's file URL, so the app can link to it.
  private async presentFull(o: any, c: any) {
    const p: any = this.present(o, c);
    let documentUrl = '';
    if (p.documentId) {
      const d: any = await this.docModelFor(o.caseKind)
        .findById(p.documentId)
        .select('fileUrl')
        .lean();
      documentUrl = d?.fileUrl ?? '';
    }
    return { ...p, documentUrl };
  }

  private shareContext(kind: CaseOutcomeKind) {
    return OUTCOME_SHARE_OPTIONS[kind];
  }

  async list(caseKind: OutcomeCaseKind, tenantId: string, caseId: string) {
    const c = await this.loadCase(caseKind, tenantId, caseId);
    const rows = await this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        caseKind,
        caseId: c._id,
      })
      .sort({ updatedAt: -1 });
    const client = await this.clientOf(c);
    return {
      client: client ? { name: client.name, email: client.email } : null,
      shareOptions: OUTCOME_SHARE_OPTIONS,
      outcomes: await Promise.all(rows.map((r) => this.presentFull(r, c))),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Save a draft / record
  // ═══════════════════════════════════════════════════════════

  async save(
    caseKind: OutcomeCaseKind,
    tenantId: string,
    userId: string,
    caseId: string,
    slug: string,
    dto: SaveCaseOutcomeDto,
  ) {
    const kind = this.kindFromSlug(caseKind, slug);
    const c = await this.loadCase(caseKind, tenantId, caseId);
    const tenantOid = new Types.ObjectId(tenantId);
    const prev = await this.model.findOne({
      tenantId: tenantOid,
      caseKind,
      caseId: c._id,
      kind,
    });

    if (prev?.status === CaseOutcomeStatus.RECORDED && dto.status === 'Draft') {
      throw new ConflictException(
        'This is already recorded. Record it again to update it.',
      );
    }
    const withdrawn =
      caseKind === 'adr'
        ? c.status === AdrCaseStatus.WITHDRAWN
        : c.status === LitigationCaseStatus.WITHDRAWN;
    if (withdrawn && dto.status === 'Recorded') {
      throw new ConflictException(
        'This case was withdrawn, so nothing can be recorded on it.',
      );
    }

    const form = this.normalise(kind, dto.form, prev?.form, c);
    const document = await this.resolveDocument(
      caseKind,
      tenantId,
      caseId,
      form.documentId,
    );
    if (!document) form.documentId = '';

    if (dto.status === 'Recorded') {
      const errs = this.validate(kind, form);
      if (errs.length) throw new BadRequestException(errs);
    }

    const d = this.derive(kind, form);
    const actor = await this.actor(userId);
    const now = new Date();
    const doc: any =
      prev ??
      new this.model({ tenantId: tenantOid, caseKind, caseId: c._id, kind });
    const wasRecorded = prev?.status === CaseOutcomeStatus.RECORDED;

    if (dto.status === 'Recorded') {
      if (wasRecorded) {
        doc.revisions.push({
          version: doc.version,
          recordedAt: doc.recordedAt,
          recordedBy: doc.recordedBy,
          form: doc.form,
        });
        doc.version = doc.version + 1;
      }
      doc.status = CaseOutcomeStatus.RECORDED;
      doc.recordedAt = now;
      doc.recordedBy = actor;
      doc.remindersSent = [];
    }
    doc.subtype = d.subtype;
    doc.form = form;
    doc.markModified('form');
    doc.amount = d.amount;
    doc.currency = d.currency;
    doc.summary = d.summary;
    doc.occurredOn = toDate(d.occurredOn);
    doc.challengeDeadline = toDate(d.challengeLast);
    doc.documentId = document ? document._id : null;
    doc.documentName = document ? document.name : '';
    await doc.save();

    let shareResult: any = null;
    let shareError = '';
    if (dto.status === 'Recorded') {
      this.applyToCase(caseKind, kind, c, form, d, doc, wasRecorded, document);
      await c.save();
      await this.notifyRecorded(
        caseKind,
        tenantId,
        userId,
        c,
        kind,
        d,
        form,
        wasRecorded,
      );
      if (dto.share) {
        try {
          shareResult = await this.share(
            caseKind,
            tenantId,
            userId,
            caseId,
            slug,
            dto.share,
          );
        } catch (err: any) {
          shareError =
            err?.message || 'The record was saved but could not be shared.';
        }
      }
    }

    const fresh = await this.model.findById(doc._id);
    return {
      outcome: await this.presentFull(fresh!, c),
      share: shareResult
        ? {
            text: shareResult.text,
            emailsSent: shareResult.emailsSent,
            emailsFailed: shareResult.emailsFailed,
          }
        : null,
      shareError,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // What recording does to the case itself
  // ═══════════════════════════════════════════════════════════

  private timeline(
    c: any,
    title: string,
    description: string,
    outcomeKind: string,
  ) {
    c.timeline.push({
      at: new Date(),
      title,
      description,
      source: 'System',
      outcomeKind,
    });
  }

  private applyToCase(
    caseKind: OutcomeCaseKind,
    kind: CaseOutcomeKind,
    c: any,
    f: Form,
    d: Derived,
    doc: any,
    isUpdate: boolean,
    document: any,
  ) {
    const cur = f.currency;
    const label = first(f.statusAfter);
    const verb = isUpdate ? `updated (version ${doc.version})` : 'recorded';
    c.outcomeStatus = label;
    c.challengeDeadline = toDate(d.challengeLast);

    switch (kind) {
      case CaseOutcomeKind.SETTLEMENT: {
        const payer = f.payer.split(' (')[0] || 'the paying party';
        const terms =
          `${f.type} settlement of ${money(f.amount, cur)} payable by ${payer} in ${f.payments.length} payment${f.payments.length === 1 ? '' : 's'}.` +
          (f.nonMonetary ? ` ${f.nonMonetary}` : '');
        c.settlement = {
          amount: f.amount,
          date: toDate(f.agreedOn) ?? new Date(),
          terms,
          deedDocumentId: document
            ? document._id
            : (c.settlement?.deedDocumentId ?? null),
        };
        // Settlement still waiting on signature leaves the case open.
        if (f.statusAfter !== 'Settlement pending signature') {
          c.stage = 'Resolution';
          c.status = AdrCaseStatus.RESOLVED;
        }
        this.timeline(c, `Settlement ${verb}`, terms, kind);
        break;
      }
      case CaseOutcomeKind.AWARD: {
        const nm = NON_MONEY_AWARD.includes(f.type);
        c.outcome = nm
          ? f.type
          : `${f.type} in favour of the ${f.favour.toLowerCase()}${d.amount ? `: ${money(d.amount, cur)}` : ''}`;
        if (f.type === 'Claim withdrawn') {
          c.status = AdrCaseStatus.WITHDRAWN;
        } else if (f.statusAfter !== 'Outcome recorded, case continues') {
          c.stage = 'Resolution';
          c.status = AdrCaseStatus.RESOLVED;
        }
        this.timeline(
          c,
          `${f.type} ${verb}`,
          `${nm ? f.type + '.' : `${c.outcome}${f.dueOn ? `, payable by ${fmtD(f.dueOn)}` : ''}.`} Next step: ${lower(f.nextStep || 'none')}.`,
          kind,
        );
        break;
      }
      case CaseOutcomeKind.CONSENT_JUDGMENT: {
        c.outcome = `Consent judgment${d.amount ? `: ${money(d.amount, cur)}` : ''} (${lower(f.orderStatus)})`;
        if (f.court) c.court = f.court;
        if (f.caseNumber) c.courtCaseNumber = f.caseNumber;
        if (f.judge) c.judge = f.judge;
        if (f.statusAfter !== 'Consent order pending endorsement') {
          c.status = LitigationCaseStatus.SETTLED;
        }
        this.timeline(
          c,
          `Consent judgment ${verb}`,
          `${f.orderStatus === 'Made by the court' ? 'Consent order made by the court' : 'Consent order ' + lower(f.orderStatus)}${d.amount ? `: ${money(d.amount, cur)} payable by ${f.payer.split(' (')[0] || 'the paying party'} in ${f.payments.length} payment${f.payments.length === 1 ? '' : 's'}` : ''}. Costs: ${lower(f.costs)}.`,
          kind,
        );
        break;
      }
      case CaseOutcomeKind.JUDGMENT: {
        const nr = NO_RELIEF_JUDGMENT.includes(f.type);
        c.outcome = `${f.type}, ${lower(f.result)}, in favour of the ${lower(f.favour)}${d.amount ? `: ${money(d.amount, cur)}` : ''}`;
        if (f.court) c.court = f.court;
        if (f.caseNumber) c.courtCaseNumber = f.caseNumber;
        if (f.judge) c.judge = f.judge;
        if (!OPEN_JUDGMENT.includes(f.type)) {
          c.stage = 'Judgment';
          c.status =
            f.satisfaction === 'Satisfied' && !nr
              ? LitigationCaseStatus.ENFORCED
              : LitigationCaseStatus.JUDGMENT_ISSUED;
        }
        this.timeline(
          c,
          `${f.type} ${verb}`,
          `${f.court || 'Court'}, ${lower(f.result)}, in favour of the ${lower(f.favour)}${nr || !d.amount ? '' : `: ${money(d.amount, cur)} payable by ${f.debtor.split(' (')[0] || 'the judgment debtor'}${f.dueOn ? ` by ${fmtD(f.dueOn)}` : ''}`}. Appeal deadline ${fmtD(f.challengeLast)}. Next step: ${lower(f.nextStep || 'none')}.`,
          kind,
        );
        break;
      }
    }
  }

  private async notifyRecorded(
    caseKind: OutcomeCaseKind,
    tenantId: string,
    userId: string,
    c: any,
    kind: CaseOutcomeKind,
    d: Derived,
    f: Form,
    isUpdate: boolean,
  ) {
    if (!f.notify) return;
    const base = {
      tenantId,
      caseKind,
      caseId: String(c._id),
      caseRef: c.ref,
      caseTitle: c.title,
      kind,
    };
    this.events.emit('tenant.case.outcome_recorded', {
      ...base,
      summary: d.summary,
      isUpdate,
      recipientUserIds: await this.teamUserIds(tenantId, c, userId),
    });
    const client = await this.clientOf(c);
    if (client?.userId) {
      this.events.emit('client.case.outcome_recorded', {
        ...base,
        clientUserId: client.userId,
        caseType: caseKind === 'adr' ? 'ADR' : 'Litigation',
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Payments, drafts
  // ═══════════════════════════════════════════════════════════

  private async findOutcome(
    caseKind: OutcomeCaseKind,
    tenantId: string,
    caseId: string,
    slug: string,
  ) {
    const kind = this.kindFromSlug(caseKind, slug);
    const c = await this.loadCase(caseKind, tenantId, caseId);
    const o = await this.model.findOne({
      tenantId: new Types.ObjectId(tenantId),
      caseKind,
      caseId: c._id,
      kind,
    });
    if (!o)
      throw new NotFoundException(
        `Nothing has been saved for this ${kind.toLowerCase()} yet`,
      );
    return { kind, c, o: o as any };
  }

  async setPaymentPaid(
    caseKind: OutcomeCaseKind,
    tenantId: string,
    caseId: string,
    slug: string,
    index: number,
    paid: boolean,
  ) {
    const { kind, c, o } = await this.findOutcome(
      caseKind,
      tenantId,
      caseId,
      slug,
    );
    if (o.status !== CaseOutcomeStatus.RECORDED) {
      throw new ConflictException(
        'Record it first, then mark payments as paid.',
      );
    }
    const p = o.form?.payments?.[index];
    if (!p) throw new NotFoundException('Payment not found');
    p.paid = paid;
    p.paidOn = paid ? todayStr() : '';
    o.markModified('form');
    if (paid) {
      // A payment that has now been made no longer needs its reminder.
      o.remindersSent = (o.remindersSent ?? []).filter(
        (k: string) => !k.startsWith(`pay:${index}:`),
      );
    }
    await o.save();
    const all = (o.form.payments as Payment[]).every((x) => x.paid);
    const n = `${index + 1}`;
    this.timeline(
      c,
      paid ? `Payment ${n} received` : `Payment ${n} marked pending`,
      `${money(p.amount, o.form.currency)} ${paid ? 'received' : 'now pending'} under the ${lower(kind)}.${paid && all ? ' All payments have now been received.' : ''}`,
      kind,
    );
    await c.save();
    return this.presentFull(o, c);
  }

  async deleteDraft(
    caseKind: OutcomeCaseKind,
    tenantId: string,
    caseId: string,
    slug: string,
  ) {
    const { o } = await this.findOutcome(caseKind, tenantId, caseId, slug);
    if (o.status !== CaseOutcomeStatus.DRAFT) {
      throw new ConflictException(
        'A recorded outcome cannot be deleted, only updated.',
      );
    }
    await o.deleteOne();
    return { deleted: true };
  }

  // ═══════════════════════════════════════════════════════════
  // Generated drafts: settlement agreement / consent order
  // ═══════════════════════════════════════════════════════════

  async generateDocument(
    caseKind: OutcomeCaseKind,
    tenantId: string,
    userId: string,
    caseId: string,
    slug: string,
    rawForm: Form,
  ) {
    const kind = this.kindFromSlug(caseKind, slug);
    if (
      kind !== CaseOutcomeKind.SETTLEMENT &&
      kind !== CaseOutcomeKind.CONSENT_JUDGMENT
    ) {
      throw new BadRequestException(
        'Only settlements and consent judgments have a generated document.',
      );
    }
    const c = await this.loadCase(caseKind, tenantId, caseId);
    const prev = await this.model.findOne({
      tenantId: new Types.ObjectId(tenantId),
      caseKind,
      caseId: c._id,
      kind,
    });
    const f = this.normalise(kind, rawForm, prev?.form, c);
    if (!f.amount && !f.nonMonetary && !f.terms) {
      throw new BadRequestException(
        'Enter the settlement amount or terms before generating the document.',
      );
    }

    const cur = f.currency;
    const isOrder = kind === CaseOutcomeKind.CONSENT_JUDGMENT;
    const ps: Payment[] = f.payments ?? [];
    const partyRows: any[] = c.parties ?? [];
    const parties = partyRows
      .filter((p) => !/judge|counsel|other/i.test(p.role))
      .map((p) => ({
        name: p.organisation ? `${p.name} (${p.organisation})` : p.name,
        role: p.role,
      }));
    const payer = f.payer || 'the paying party';
    const payee = f.payee || 'the receiving party';
    const clauses: { heading: string; body: string[] }[] = [];
    clauses.push({
      heading: 'Settlement',
      body: [
        isOrder
          ? f.terms ||
            `By consent, ${payer} shall pay ${payee} ${money(f.amount, cur)} in settlement of the claim.`
          : `The parties agree to settle the dispute on a ${lower(f.type)} basis${f.amount ? ` for ${money(f.amount, cur)}` : ''}, payable by ${payer} to ${payee}.`,
      ],
    });
    if (f.type === 'Conditional' && f.conditions) {
      clauses.push({
        heading: 'Conditions',
        body: [
          `This settlement takes effect only when the following are met: ${f.conditions}`,
        ],
      });
    }
    if (f.amount) {
      const body = [
        ps.length > 1
          ? `The amount is payable in ${ps.length} instalments as set out in the schedule below.`
          : 'The amount is payable in a single payment as set out below.',
      ];
      if (f.interest) body.push(`Interest on late payment: ${f.interest}.`);
      if (isOrder ? f.onDefault : f.defaultConsequence)
        body.push(
          `On default: ${isOrder ? f.onDefault : f.defaultConsequence}.`,
        );
      clauses.push({ heading: 'Payment', body });
    }
    if (f.nonMonetary)
      clauses.push({ heading: 'Other terms', body: [f.nonMonetary] });
    const protections: string[] = [];
    if (isOrder ? f.fullAndFinal : f.mutualRelease)
      protections.push(
        isOrder
          ? 'This is in full and final settlement of the claim and any counterclaim.'
          : 'Each party releases the other from all claims arising from this dispute once the terms are performed.',
      );
    if (f.noAdmission)
      protections.push(
        'Nothing in this document is an admission of liability.',
      );
    if (isOrder ? f.separateAgreement : f.confidential)
      protections.push(
        isOrder
          ? 'Confidential terms are recorded in a separate settlement agreement.'
          : 'The terms of this settlement are confidential.',
      );
    if (!isOrder && f.consentAward)
      protections.push(
        'The parties will apply for the proceedings to be withdrawn or for a consent award.',
      );
    if (protections.length)
      clauses.push({ heading: 'Scope and protections', body: protections });
    clauses.push({
      heading: 'Costs',
      body: [
        f.costs === 'Agreed amount'
          ? `Costs are agreed at ${money(f.costsAmount, cur)}.`
          : `Costs: ${lower(f.costs)}.`,
      ],
    });
    if (!isOrder && c.governingLaw) {
      clauses.push({
        heading: 'Governing law',
        body: [`This agreement is governed by the law of ${c.governingLaw}.`],
      });
    }

    const buffer = await this.pdf.buildDocumentPdf({
      firmName: await this.businessName(tenantId),
      title: isOrder ? 'Consent Order' : 'Settlement Agreement',
      ref: c.ref,
      caption: c.title,
      subCaption: isOrder
        ? `${f.court || c.court || ''}${f.caseNumber ? ` · Case No. ${f.caseNumber}` : ''}`
        : `${c.type}${c.venue ? ` · ${c.venue}` : ''}`,
      preamble: isOrder
        ? 'Upon the parties agreeing the terms below, it is ordered by consent that:'
        : 'This agreement is made between the parties named below, in settlement of the dispute described above.',
      parties,
      clauses,
      scheduleTable: ps.length
        ? {
            head: ['#', 'Due date', 'Amount', 'Method'],
            rows: ps.map((p, i) => [
              String(i + 1),
              fmtD(p.dueOn) || 'To be agreed',
              fmtN(p.amount),
              p.method,
            ]),
          }
        : null,
      signatories: parties.length
        ? parties.map((p) => `${p.name} (${p.role})`)
        : ['Party one', 'Party two'],
      note: 'Draft for review by counsel before signature',
    });

    const sub = caseKind === 'adr' ? 'adr-cases' : 'litigation-cases';
    const dir = join(process.cwd(), 'uploads', 'crm', sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = `${uuidv4()}.pdf`;
    fs.writeFileSync(join(dir, filename), buffer);
    const actor = await this.actor(userId);
    const created = await this.docModelFor(caseKind).create({
      tenantId: new Types.ObjectId(tenantId),
      caseId: c._id,
      folder: 'General',
      name: `${isOrder ? 'Consent Order' : 'Settlement Agreement'} (draft) - ${c.ref}.pdf`,
      fileUrl: `/uploads/crm/${sub}/${filename}`,
      size: buffer.length,
      mimeType: 'application/pdf',
      uploadedBy: actor.name,
    });
    this.timeline(
      c,
      `Draft ${isOrder ? 'consent order' : 'settlement agreement'} generated`,
      `Filed in Documents as ${created.name}.`,
      '',
    );
    await c.save();
    return created.toObject();
  }

  // ═══════════════════════════════════════════════════════════
  // Record PDF
  // ═══════════════════════════════════════════════════════════

  async recordPdf(
    caseKind: OutcomeCaseKind,
    tenantId: string,
    caseId: string,
    slug: string,
  ) {
    const { c, o } = await this.findOutcome(caseKind, tenantId, caseId, slug);
    const p = this.present(o, c) as any;
    const buffer = await this.pdf.buildRecordPdf({
      firmName: await this.businessName(tenantId),
      kind:
        p.subtype && p.subtype !== p.kind ? `${p.kind}: ${p.subtype}` : p.kind,
      ref: c.ref,
      matter: this.caseLabel(caseKind, c),
      version: p.version,
      status:
        p.status === CaseOutcomeStatus.RECORDED ? 'Recorded' : 'Draft saved',
      recordedBy: p.recordedBy?.name ?? '',
      recordedAt: p.recordedAt
        ? new Date(p.recordedAt).toLocaleString('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : 'not yet recorded',
      sections: p.sections,
      sharing: (p.shared ?? []).map((s: any) => ({
        when: new Date(s.at).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        text: `${(s.documents ?? []).join(', ')}: ${s.text}`,
      })),
    });
    return { buffer, filename: `${c.ref}-${slug}.pdf` };
  }

  // ═══════════════════════════════════════════════════════════
  // Sharing
  // ═══════════════════════════════════════════════════════════

  private readStoredFile(stored: string): Buffer | null {
    try {
      let rel = stored;
      const i = rel.indexOf('/uploads/');
      if (i >= 0) rel = rel.slice(i + '/uploads/'.length);
      const full = fs.existsSync(rel)
        ? rel
        : join(process.cwd(), 'uploads', rel);
      return fs.existsSync(full) ? fs.readFileSync(full) : null;
    } catch {
      return null;
    }
  }

  async share(
    caseKind: OutcomeCaseKind,
    tenantId: string,
    userId: string,
    caseId: string,
    slug: string,
    dto: OutcomeShareDto,
  ) {
    const { kind, c, o } = await this.findOutcome(
      caseKind,
      tenantId,
      caseId,
      slug,
    );
    const opts = this.shareContext(kind);
    const channels = (dto.channels ?? []).filter((x) =>
      ['email', 'portal', 'file'].includes(x),
    );
    if (!channels.length)
      throw new BadRequestException(
        'Choose email, the client portal or the filing step first.',
      );
    const docs = (dto.documents ?? []).filter((x) =>
      opts.documents.includes(x),
    );
    if (!docs.length)
      throw new BadRequestException('Select at least one document to send.');

    const mainDoc = o.documentId
      ? await this.resolveDocument(caseKind, tenantId, caseId, o.documentId)
      : null;
    if (!mainDoc) {
      throw new BadRequestException(
        kind === CaseOutcomeKind.SETTLEMENT ||
          kind === CaseOutcomeKind.CONSENT_JUDGMENT
          ? `Generate or attach the ${lower(opts.mainDocument)} before sending.`
          : `Attach the ${lower(opts.mainDocument)} before sending.`,
      );
    }

    const emails = [
      ...new Set(
        (dto.recipients ?? [])
          .map((e) => e.trim().toLowerCase())
          .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)),
      ),
    ];
    if (channels.includes('email') && !emails.length) {
      throw new BadRequestException(
        'Select at least one email recipient, or untick Email.',
      );
    }

    const actor = await this.actor(userId);
    const parts: string[] = [];
    let emailsSent = 0;
    const emailsFailed: string[] = [];

    if (channels.includes('email')) {
      const attachments: {
        filename: string;
        content: Buffer;
        contentType: string;
      }[] = [];
      if (docs.includes(opts.mainDocument)) {
        const buf = this.readStoredFile(mainDoc.fileUrl);
        if (buf) {
          attachments.push({
            filename: mainDoc.name,
            content: buf,
            contentType: mainDoc.mimeType || 'application/octet-stream',
          });
        }
      }
      if (docs.some((d) => d !== opts.mainDocument)) {
        const rec = await this.recordPdf(caseKind, tenantId, caseId, slug);
        attachments.push({
          filename: rec.filename,
          content: rec.buffer,
          contentType: 'application/pdf',
        });
      }

      let cc: string[] = [];
      if (dto.copyTeam !== false) {
        const ids = await this.teamUserIds(tenantId, c);
        if (!ids.includes(userId)) ids.push(userId);
        const users = await this.userModel
          .find({ _id: { $in: ids.filter((i) => Types.ObjectId.isValid(i)) } })
          .select('email')
          .lean();
        cc = [
          ...new Set(
            users
              .map((u: any) => String(u.email || '').toLowerCase())
              .filter(Boolean),
          ),
        ].filter((e) => !emails.includes(e));
      }
      const business = await this.businessName(tenantId);
      const subject = str(dto.subject, 200) || `${opts.subject}: ${c.title}`;
      const body =
        (str(dto.message, 6000) || opts.message) +
        `\n\nIncluded: ${docs.join(', ')}.` +
        (attachments.length
          ? ''
          : '\n\n(The files could not be attached. Please ask the sender to resend.)');
      for (const to of emails) {
        try {
          await this.emailService.sendCaseOutcomeEmail({
            to,
            cc,
            partyName: to.split('@')[0],
            tenantBusinessName: business,
            caseRef: c.ref,
            subject,
            body,
            attachments,
          });
          emailsSent++;
        } catch (err: any) {
          this.logger.warn(`Outcome email to ${to} failed: ${err?.message}`);
          emailsFailed.push(to);
        }
      }
      if (!emailsSent) {
        throw new BadRequestException(
          `The email could not be sent to ${emailsFailed.join(', ')}. Check the addresses and try again.`,
        );
      }
      parts.push(
        `emailed to ${emails.filter((e) => !emailsFailed.includes(e)).join(', ')} as PDF attachment${attachments.length === 1 ? '' : 's'}`,
      );
    }
    const portal = channels.includes('portal');
    if (portal) {
      parts.push(
        `published to the client portal${dto.acknowledgement ? ' (acknowledgement requested)' : ''}${dto.allowComments ? ' (comments allowed)' : ''}`,
      );
    }
    if (channels.includes('file')) parts.push(opts.fileDone);
    const text = parts.join('; ');

    o.shared.push({
      at: new Date(),
      by: actor,
      channels,
      recipients: channels.includes('email') ? emails : [],
      documents: docs,
      delivery: channels.includes('email') ? 'PDF attachment' : '',
      subject: str(dto.subject, 200),
      text,
      portalPublished: portal,
      acknowledgementRequested: portal && !!dto.acknowledgement,
      commentsAllowed: portal && !!dto.allowComments,
      emailsSent,
      emailsFailed,
    });
    await o.save();
    this.timeline(c, `${kind} shared`, `${docs.join(', ')}: ${text}.`, kind);
    await c.save();

    if (portal) {
      const client = await this.clientOf(c);
      if (client?.userId) {
        this.events.emit('client.case.outcome_shared', {
          tenantId,
          clientUserId: client.userId,
          caseType: caseKind === 'adr' ? 'ADR' : 'Litigation',
          caseTitle: c.title,
          caseRef: c.ref,
          kind,
          acknowledgementRequested: !!dto.acknowledgement,
        });
      }
    }
    return { text, emailsSent, emailsFailed, outcome: await this.presentFull(o, c) };
  }

  // ═══════════════════════════════════════════════════════════
  // What the client sees in the portal — only what was published
  // ═══════════════════════════════════════════════════════════

  async portalOutcomes(tenantId: string, caseId: string) {
    const rows: any[] = await this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        caseId: new Types.ObjectId(caseId),
        'shared.portalPublished': true,
      })
      .lean();
    return rows.map((o) => {
      const published = (o.shared ?? []).filter((s: any) => s.portalPublished);
      const last = published[published.length - 1];
      return {
        kind: o.kind,
        subtype: o.subtype,
        summary: o.summary,
        amount: o.amount,
        currency: o.currency,
        occurredOn: o.occurredOn,
        challengeDeadline: o.challengeDeadline,
        payments: (o.form?.payments ?? []).map((p: Payment) => ({
          dueOn: p.dueOn,
          amount: p.amount,
          paid: p.paid,
        })),
        publishedAt: last?.at ?? null,
        acknowledgementRequested: !!last?.acknowledgementRequested,
        commentsAllowed: !!last?.commentsAllowed,
        recorded: o.status === CaseOutcomeStatus.RECORDED,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Daily reminders — payments 3 days ahead, compliance and appeal
  // deadlines 7 days ahead, and once more if one is missed.
  // ═══════════════════════════════════════════════════════════

  @Cron('0 8 * * *', { name: 'case-outcome-reminders' })
  async sendReminders() {
    const rows: any[] = await this.model.find({
      status: CaseOutcomeStatus.RECORDED,
      'form.remind': true,
    });
    for (const o of rows) {
      try {
        const model: Model<any> =
          o.caseKind === 'adr' ? this.adrModel : this.litModel;
        const c: any = await model
          .findById(o.caseId)
          .select('ref title teamId')
          .lean();
        if (!c) continue;
        const f: Form = o.form ?? {};
        const due: {
          key: string;
          title: string;
          date: string;
          window: number;
        }[] = [];
        if (
          o.kind === CaseOutcomeKind.SETTLEMENT ||
          o.kind === CaseOutcomeKind.CONSENT_JUDGMENT
        ) {
          (f.payments ?? []).forEach((p: Payment, i: number) => {
            if (!p.paid && p.dueOn)
              due.push({
                key: `pay:${i}`,
                title: `Instalment ${i + 1} (${money(p.amount, f.currency)})`,
                date: p.dueOn,
                window: 3,
              });
          });
        } else if (o.kind === CaseOutcomeKind.AWARD) {
          if (f.compliance !== 'Complied' && f.dueOn)
            due.push({
              key: 'due',
              title: 'Award compliance deadline',
              date: f.dueOn,
              window: 7,
            });
        } else if (o.kind === CaseOutcomeKind.JUDGMENT) {
          if (f.challengeLast)
            due.push({
              key: 'appeal',
              title: 'Last day to appeal',
              date: f.challengeLast,
              window: 7,
            });
          if (f.satisfaction !== 'Satisfied' && f.dueOn)
            due.push({
              key: 'due',
              title: 'Judgment payment or compliance date',
              date: f.dueOn,
              window: 7,
            });
        }
        const sent: string[] = o.remindersSent ?? [];
        for (const item of due) {
          const left = daysFromToday(item.date);
          const stage = left < 0 ? 'late' : left <= item.window ? 'soon' : '';
          if (!stage) continue;
          const key = `${item.key}:${stage}`;
          if (sent.includes(key)) continue;
          this.events.emit('tenant.case.outcome_reminder', {
            tenantId: String(o.tenantId),
            caseKind: o.caseKind,
            caseId: String(o.caseId),
            caseRef: c.ref,
            caseTitle: c.title,
            title: `${item.title} ${left < 0 ? `was due ${fmtD(item.date)}` : left === 0 ? 'is due today' : `is due in ${left} day${left === 1 ? '' : 's'}`}`,
            recipientUserIds: await this.teamUserIds(String(o.tenantId), c),
          });
          sent.push(key);
        }
        if (sent.length !== (o.remindersSent ?? []).length) {
          await this.model.updateOne(
            { _id: o._id },
            { $set: { remindersSent: sent } },
          );
        }
      } catch (err: any) {
        this.logger.error(
          `Outcome reminder failed for ${o._id}: ${err?.message}`,
        );
      }
    }
  }
}
