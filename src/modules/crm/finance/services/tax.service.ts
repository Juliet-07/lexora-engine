import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as fs from 'fs';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TaxObligation,
  TaxObligationDocument,
  TaxObligationStatus,
  TaxPeriodType,
  TaxPriority,
  TaxRecurrence,
} from '../schemas';
import { EbmStatus } from '../schemas';
import { CreateTaxObligationDto, RecordTaxFilingDto } from '../dtos';
import { InvoiceService } from './invoice.service';
import { BillService } from './purchases.service';
import { PayrollRunService } from 'src/modules/hr/services/payroll-run.service';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { AccountStatus, UserType } from 'src/common/interfaces/user-role.enum';
import { ExchangeRateService } from 'src/modules/hr/services/exchange-rate.service';
import {
  CalendarEvent,
  CalendarEventDocument,
  CalendarLayer,
  RecurrenceRule,
} from 'src/modules/crm/tools/schemas/calendar.schema';

// ── Recurring tax obligations — shared date/label math used both
// when an obligation is first created and by
// TaxObligationReminderService when it rolls the chain forward.
// All dates are UTC calendar dates (a due date is a day, not a moment).

export const FREQUENCY_MONTHS: Record<TaxRecurrence, number> = {
  [TaxRecurrence.MONTHLY]: 1,
  [TaxRecurrence.QUARTERLY]: 3,
  [TaxRecurrence.BIANNUALLY]: 6,
  [TaxRecurrence.ANNUALLY]: 12,
};

export const FREQUENCY_CALENDAR_RULE: Record<TaxRecurrence, RecurrenceRule> = {
  [TaxRecurrence.MONTHLY]: RecurrenceRule.MONTHLY,
  [TaxRecurrence.QUARTERLY]: RecurrenceRule.QUARTERLY,
  // The calendar has no half-yearly rule — each period's entry is
  // created by the chain as it rolls, so it is a plain dated entry.
  [TaxRecurrence.BIANNUALLY]: RecurrenceRule.NONE,
  [TaxRecurrence.ANNUALLY]: RecurrenceRule.ANNUALLY,
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

// The due date `months` on from `from`, on `dueDay` of that month
// (clamped to the month's length, so 31 means "last day"). Without a
// dueDay the same day of the month is kept, clamped the same way —
// never the "Jan 31 + 1 month = Mar 3" overflow of Date#setMonth.
export function addMonthsOnDay(
  from: Date,
  months: number,
  dueDay?: number | null,
): Date {
  const total = from.getUTCFullYear() * 12 + from.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const day = Math.min(dueDay ?? from.getUTCDate(), daysInMonth(year, month));
  return new Date(Date.UTC(year, month, day));
}

export function nextDueDate(
  from: Date,
  frequency: TaxRecurrence,
  dueDay?: number | null,
): Date {
  return addMonthsOnDay(from, FREQUENCY_MONTHS[frequency], dueDay);
}

// First day (UTC) of the period being filed for.
export function periodStartFor(
  type: TaxPeriodType,
  year: number,
  month?: number,
  quarter?: number,
): Date | null {
  if (type === TaxPeriodType.MONTHLY)
    return new Date(Date.UTC(year, (month ?? 1) - 1, 1));
  if (type === TaxPeriodType.QUARTERLY)
    return new Date(Date.UTC(year, ((quarter ?? 1) - 1) * 3, 1));
  if (type === TaxPeriodType.ANNUAL) return new Date(Date.UTC(year, 0, 1));
  return null;
}

export function periodLabelFor(type: TaxPeriodType, start: Date): string {
  const year = start.getUTCFullYear();
  if (type === TaxPeriodType.MONTHLY)
    return `${MONTH_NAMES[start.getUTCMonth()]} ${year}`;
  if (type === TaxPeriodType.QUARTERLY)
    return `Q${Math.floor(start.getUTCMonth() / 3) + 1} ${year}`;
  return `Year of Income ${year}`;
}

// Sort key that orders periods chronologically inside a year folder.
export function periodKeyFor(type: TaxPeriodType, start: Date): number {
  const year = start.getUTCFullYear();
  const m = start.getUTCMonth();
  if (type === TaxPeriodType.MONTHLY) return year * 100 + m + 1;
  if (type === TaxPeriodType.QUARTERLY) return year * 100 + m + 3;
  return year * 100 + 12;
}

// Older rows stored a plain label ("2026-11", "2026-Q4", "2026") and no
// structured period. Read them into the same shape so the calendar and
// the archive treat every row alike.
function legacyPeriod(
  period: string,
  dueOn: Date,
): { type: TaxPeriodType; start: Date | null; label: string } {
  let m = /^(\d{4})-(\d{2})$/.exec(period);
  if (m) {
    const start = new Date(Date.UTC(+m[1], +m[2] - 1, 1));
    return {
      type: TaxPeriodType.MONTHLY,
      start,
      label: periodLabelFor(TaxPeriodType.MONTHLY, start),
    };
  }
  m = /^(\d{4})-Q([1-4])$/.exec(period);
  if (m) {
    const start = new Date(Date.UTC(+m[1], (+m[2] - 1) * 3, 1));
    return {
      type: TaxPeriodType.QUARTERLY,
      start,
      label: periodLabelFor(TaxPeriodType.QUARTERLY, start),
    };
  }
  m = /^(\d{4})$/.exec(period);
  if (m) {
    const start = new Date(Date.UTC(+m[1], 0, 1));
    return {
      type: TaxPeriodType.ANNUAL,
      start,
      label: periodLabelFor(TaxPeriodType.ANNUAL, start),
    };
  }
  return { type: TaxPeriodType.ONCE_OFF, start: null, label: period };
}

// ── VAT — real output VAT from invoices, real input VAT from bills ──

@Injectable()
export class VatService {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly billService: BillService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  // period is "YYYY-MM"; defaults to the current month.
  async getReturn(tenantId: string, period?: string, displayCurrency?: string) {
    const targetPeriod = period ?? new Date().toISOString().slice(0, 7);
    const [invoices, bills] = await Promise.all([
      this.invoiceService.getAll(tenantId),
      this.billService.getAll(tenantId),
    ]);

    const tenant = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.baseCurrency')
      .lean();
    const baseCurrency = (tenant as any)?.tenantProfile?.baseCurrency || 'USD';
    const targetCurrency = (displayCurrency || baseCurrency).toUpperCase();
    const rateCache = new Map<string, number>();
    const rateTo = async (currency: string): Promise<number> => {
      const cur = (currency || 'USD').toUpperCase();
      if (cur === targetCurrency) return 1;
      if (rateCache.has(cur)) return rateCache.get(cur)!;
      const { rate } = await this.exchangeRateService.getRate(
        cur,
        targetCurrency,
      );
      rateCache.set(cur, rate);
      return rate;
    };

    const inPeriod = (d: string | Date) =>
      new Date(d).toISOString().slice(0, 7) === targetPeriod;

    const outputLines = await Promise.all(
      invoices
        .filter((i: any) => inPeriod(i.issuedOn) && i.stage !== 'Draft')
        .map(async (i: any) => {
          const rate = await rateTo(i.currency);
          return {
            category: `Sales — ${i.ref}`,
            type: 'Output' as const,
            base: Number((i.net * rate).toFixed(2)),
            vat: Number((i.vat * rate).toFixed(2)),
          };
        }),
    );
    const inputLines = await Promise.all(
      bills
        .filter((b: any) => inPeriod(b.dueOn) && b.vatAmount > 0)
        .map(async (b: any) => {
          const rate = await rateTo(b.currency);
          return {
            category: `Purchases — ${b.ref}`,
            type: 'Input' as const,
            base: Number(((b.amount - b.vatAmount) * rate).toFixed(2)),
            vat: Number((b.vatAmount * rate).toFixed(2)),
          };
        }),
    );

    const outputVat = outputLines.reduce((s, l) => s + l.vat, 0);
    const inputVat = inputLines.reduce((s, l) => s + l.vat, 0);

    return {
      period: targetPeriod,
      currency: targetCurrency,
      outputVat,
      inputVat,
      netPayable: outputVat - inputVat,
      lines: [...outputLines, ...inputLines],
    };
  }
}

// ── PAYE & RSSB — real, sourced from the actual HR payroll run and
// its payslips' own deduction lines. Rwanda's RSSB covers pension,
// maternity and occupational hazard contributions; CBHI is a
// separate community health scheme, not part of RSSB, so it's
// excluded from the RSSB figure here. ──────────────────────────

const RSSB_DEDUCTION_KEYS = ['pension', 'maternity', 'occupational_hazard'];

@Injectable()
export class PayrollTaxService {
  constructor(private readonly payrollRunService: PayrollRunService) {}

  async getRemittances(tenantId: string) {
    const runs = await this.payrollRunService.getAllRuns(tenantId);
    return Promise.all(
      (runs as any[]).map(async (run) => {
        const { payslips } = await this.payrollRunService.getRunDetail(
          tenantId,
          String(run._id),
        );
        let paye = 0;
        let rssb = 0;
        (payslips as any[]).forEach((p) => {
          (p.deductions ?? []).forEach((d: any) => {
            const key = String(d.key ?? '').toLowerCase();
            if (key === 'paye') paye += d.amount;
            else if (RSSB_DEDUCTION_KEYS.includes(key)) rssb += d.amount;
          });
        });
        return {
          period: run.periodLabel,
          gross: run.totalGross,
          paye,
          rssb,
          status: run.status,
        };
      }),
    );
  }
}

// ── CIT — a real but partial computation. Revenue and expenses here
// come from real paid invoices, paid bills and payroll — a genuine
// number, not fabricated. It's not yet a full accrual-basis P&L
// (no depreciation, no non-deductible add-backs, no capital
// allowances computed elsewhere) — that becomes more precise once
// Reporting exists. Flagged clearly rather than presented as final. ──

@Injectable()
export class CitService {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly billService: BillService,
    private readonly payrollRunService: PayrollRunService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  async getProvision(tenantId: string, displayCurrency?: string) {
    const [invoices, bills, runs] = await Promise.all([
      this.invoiceService.getAll(tenantId),
      this.billService.getAll(tenantId),
      this.payrollRunService.getAllRuns(tenantId),
    ]);

    const tenant = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.baseCurrency')
      .lean();
    const baseCurrency = (tenant as any)?.tenantProfile?.baseCurrency || 'USD';
    const targetCurrency = (displayCurrency || baseCurrency).toUpperCase();
    const rateCache = new Map<string, number>();
    const rateTo = async (currency: string): Promise<number> => {
      const cur = (currency || 'USD').toUpperCase();
      if (cur === targetCurrency) return 1;
      if (rateCache.has(cur)) return rateCache.get(cur)!;
      const { rate } = await this.exchangeRateService.getRate(
        cur,
        targetCurrency,
      );
      rateCache.set(cur, rate);
      return rate;
    };

    const paidInvoices = invoices.filter(
      (i: any) => i.stage === 'Paid' || i.stage === 'Part Paid',
    );
    const revenue = (
      await Promise.all(
        paidInvoices.map(
          async (i: any) => i.paidAmount * (await rateTo(i.currency)),
        ),
      )
    ).reduce((s, v) => s + v, 0);
    const paidBills = bills.filter((b: any) => b.status === 'Paid');
    const billExpenses = (
      await Promise.all(
        paidBills.map(async (b: any) => b.amount * (await rateTo(b.currency))),
      )
    ).reduce((s, v) => s + v, 0);
    // Payroll expenses aren't converted here — payroll runs carry
    // their own currency (via PayrollPolicy), a separate concern
    // from Sales/Purchases currency handling that this fix doesn't
    // touch.
    const payrollExpenses = (runs as any[])
      .filter((r) => r.status === 'paid')
      .reduce((s, r) => s + r.totalGross + r.totalEmployerContributions, 0);

    const profitBeforeTax = revenue - billExpenses - payrollExpenses;
    const citRate = 28;
    const citAtRate = Math.max(0, profitBeforeTax * (citRate / 100));

    return {
      currency: targetCurrency,
      revenue,
      expenses: billExpenses + payrollExpenses,
      profitBeforeTax,
      citRate,
      citAtRate,
      note: 'Computed from real paid invoices, bills and payroll — a partial cash-basis figure, not yet a full accrual P&L with capital allowances and non-deductible add-backs.',
    };
  }
}

// ── EBM — real register, derived from real invoices that need RRA
// e-invoicing sync. No live RRA API integration (that needs real
// government API credentials this environment doesn't have);
// re-sync flips the real stored status. ──────────────────────────

@Injectable()
export class EbmService {
  constructor(private readonly invoiceService: InvoiceService) {}

  async getStatus(tenantId: string) {
    const invoices = await this.invoiceService.getAll(tenantId);
    return invoices
      .filter((i: any) => i.stage !== 'Draft')
      .map((i: any) => ({
        _id: i._id,
        document: i.ref,
        receipt: i.ebmReceiptNumber || '—',
        classification: i.vatRate > 0 ? `VAT ${i.vatRate}%` : 'Exempt',
        status: i.ebmStatus,
        receiptFileUrl: i.ebmReceiptFileUrl || null,
        receiptFileName: i.ebmReceiptFileName || null,
      }));
  }

  async resync(tenantId: string, invoiceId: string) {
    // No real RRA connection to actually call — this marks the
    // document as synced. It no longer invents a receipt number:
    // the real one is captured separately via updateReceipt, once
    // the tenant actually has it off the EBM device.
    await this.invoiceService.setEbmStatus(
      tenantId,
      invoiceId,
      EbmStatus.SYNCED,
    );
    return this.invoiceService.getById(tenantId, invoiceId);
  }

  // The real receipt number, typed in by the tenant off the actual
  // EBM device/slip, optionally with a photo or scan of that receipt
  // as evidence — replaces the old auto-generated placeholder.
  async updateReceipt(
    tenantId: string,
    invoiceId: string,
    receiptNumber: string,
    file?: Express.Multer.File | null,
  ) {
    return this.invoiceService.setEbmReceipt(
      tenantId,
      invoiceId,
      receiptNumber,
      file,
    );
  }

  // EBM rows aren't a standalone collection — they're derived live off
  // Invoice documents, so "delete" can't mean removing the row itself.
  // What it means is: clear the manually-recorded receipt (number +
  // attached file) and revert the document back to Pending, so the
  // tenant can re-enter it correctly.
  async deleteReceipt(tenantId: string, invoiceId: string) {
    return this.invoiceService.clearEbmReceipt(tenantId, invoiceId);
  }
}

// ── Tax calendar ──────────────────────────────────────────────

// Who is acting on an obligation. The tenant owner account has the
// final say on filings; everyone else (an employee with finance
// access) can prepare and record, but the owner approves.
export interface TaxActor {
  id: string;
  name: string;
  userType: string;
}
const isOwner = (a: TaxActor) => a.userType === UserType.TENANT;

export interface RecordFilingFiles {
  returnFile?: Express.Multer.File[];
  popFile?: Express.Multer.File[];
}

const toFileUrl = (filePath: string): string => {
  const raw = filePath.replace(/\\/g, '/');
  const i = raw.indexOf('uploads/');
  return `${process.env.APP_URL}/${i !== -1 ? raw.slice(i) : raw}`;
};
const removeFile = (path?: string | null) => {
  try {
    if (path && fs.existsSync(path)) fs.unlinkSync(path);
  } catch {
    /* a stale file on disk is not worth failing the request */
  }
};

@Injectable()
export class TaxObligationService {
  constructor(
    @InjectModel(TaxObligation.name)
    private readonly model: Model<TaxObligationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(CalendarEvent.name)
    private readonly calendarEventModel: Model<CalendarEventDocument>,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Read shape: every row carries a structured period (older rows are
  // read into the same shape) and server file paths never leave here.
  private normalize(o: any) {
    const legacy =
      o.periodStart || !o.period
        ? null
        : legacyPeriod(o.period, new Date(o.dueOn));
    const periodType: TaxPeriodType =
      legacy?.type ?? o.periodType ?? TaxPeriodType.MONTHLY;
    const start: Date | null = legacy?.start ?? o.periodStart ?? null;
    const dueYear = new Date(o.dueOn).getUTCFullYear();
    const strip = (f: any) => {
      if (!f) return null;
      const { path: _p, ...rest } = f;
      return rest;
    };
    return {
      ...o,
      name: o.name || `${o.type} — ${legacy?.label ?? o.period}`,
      period: legacy?.label ?? o.period,
      periodType,
      periodStart: start,
      periodYear: start ? start.getUTCFullYear() : dueYear,
      periodKey: start
        ? periodKeyFor(periodType, start)
        : dueYear * 100 + new Date(o.dueOn).getUTCMonth() + 1,
      filing: o.filing
        ? {
            ...o.filing,
            returnFile: strip(o.filing.returnFile),
            popFile: strip(o.filing.popFile),
          }
        : null,
    };
  }

  async getAll(tenantId: string) {
    const rows = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ dueOn: 1 })
      .lean();
    return rows.map((r) => this.normalize(r));
  }

  // The people an obligation can be assigned to: the owner account and
  // the tenant's active employees. Deliberately not the HR employee
  // list — a finance-only user can't read HR, but still assigns tax.
  async getResponsibleOptions(tenantId: string) {
    const tid = new Types.ObjectId(tenantId);
    const users = await this.userModel
      .find({
        $or: [
          { _id: tid },
          {
            tenantId: tid,
            userType: UserType.EMPLOYEE,
            status: AccountStatus.ACTIVE,
          },
        ],
      })
      .select('firstName lastName tenantProfile.businessName userType')
      .lean();
    return users
      .map((u: any) => ({
        _id: String(u._id),
        name:
          [u.firstName, u.lastName].filter(Boolean).join(' ') ||
          u.tenantProfile?.businessName ||
          'Account owner',
        isOwner: u.userType === UserType.TENANT,
      }))
      .sort((a, b) => Number(b.isOwner) - Number(a.isOwner));
  }

  private async responsibleFor(tenantId: string, id?: string) {
    if (!id) return { responsibleId: null, responsibleName: '' };
    const options = await this.getResponsibleOptions(tenantId);
    const found = options.find((o) => o._id === id);
    if (!found)
      throw new BadRequestException(
        'The responsible person has to be on your team.',
      );
    return {
      responsibleId: new Types.ObjectId(found._id),
      responsibleName: found.name,
    };
  }

  // Creating the obligation is the real reminder — an email goes
  // out immediately with the type, period, amount and due date. If
  // the send fails (bad address, SMTP hiccup) the obligation is
  // still created; the tenant sees it on the calendar regardless
  // and email delivery doesn't block the record existing.
  //
  // When recurring is set (just a frequency and the day of the month
  // it falls due), this obligation is filed on the shared Finance
  // calendar and becomes the head of a chain: nextDueOn is stored on
  // it, and TaxObligationReminderService's daily cron watches that
  // date — once it's within the reminder window, it creates the next
  // period's obligation (repeating this same create-time work: email +
  // calendar entry) and rolls the chain forward. Nothing else is asked
  // of the user; entries and reminders are the backend's job.
  async create(tenantId: string, dto: CreateTaxObligationDto) {
    const dueOn = new Date(dto.dueOn);
    const type = dto.periodType;

    let period: string;
    let periodStart: Date | null = null;
    if (type === TaxPeriodType.ONCE_OFF) {
      period = (dto.period ?? '').trim();
      if (!period)
        throw new BadRequestException('Give the period this covers.');
    } else {
      if (!dto.periodYear)
        throw new BadRequestException('Choose the year of the period.');
      if (type === TaxPeriodType.MONTHLY && !dto.periodMonth)
        throw new BadRequestException('Choose the month of the period.');
      if (type === TaxPeriodType.QUARTERLY && !dto.periodQuarter)
        throw new BadRequestException('Choose the quarter of the period.');
      periodStart = periodStartFor(
        type,
        dto.periodYear,
        dto.periodMonth,
        dto.periodQuarter,
      );
      period = periodLabelFor(type, periodStart!);
    }

    const recurring = !!dto.recurring;
    if (recurring && !dto.frequency)
      throw new BadRequestException('Choose how often it recurs.');
    if (recurring && type === TaxPeriodType.ONCE_OFF)
      throw new BadRequestException('A once-off obligation cannot recur.');
    const dueDay = recurring ? (dto.dueDay ?? dueOn.getUTCDate()) : null;
    const nextDueOn = recurring
      ? nextDueDate(dueOn, dto.frequency!, dueDay)
      : null;

    const tenant = await this.userModel.findById(tenantId).lean();
    const profile = tenant?.tenantProfile;
    const currency = (
      dto.currency ||
      (profile as any)?.baseCurrency ||
      'RWF'
    ).toUpperCase();
    const responsible = await this.responsibleFor(tenantId, dto.responsibleId);

    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      type: dto.type,
      name: (dto.name ?? '').trim(),
      jurisdiction: dto.jurisdiction ?? '',
      currency,
      periodType: type,
      period,
      periodStart,
      dueOn,
      amount: dto.amount ?? 0,
      ...responsible,
      priority: dto.priority ?? TaxPriority.NORMAL,
      notes: dto.notes ?? '',
      requireDocuments: dto.requireDocuments ?? true,
      recurring,
      frequency: recurring ? dto.frequency : null,
      dueDay,
      nextDueOn,
    });

    await this.remind(created, tenant);

    if (recurring) {
      await this.calendarEventModel
        .create({
          tenantId: new Types.ObjectId(tenantId),
          title: `${dto.type} due — ${period}`,
          date: created.dueOn.toISOString().slice(0, 10),
          time: '09:00',
          layer: CalendarLayer.FINANCE,
          recurrence: FREQUENCY_CALENDAR_RULE[dto.frequency!],
          createdBy: profile?.businessName || 'Your firm',
          sourceType: 'TaxObligation',
          sourceId: created._id,
        })
        .catch(() => undefined);
    }

    return this.normalize(created.toObject());
  }

  // The branded reminder email — to the firm's contact, and to the
  // responsible person when one is assigned. Shared with the chain
  // roll so a new period is announced exactly like a created one.
  async remind(o: TaxObligationDocument, tenant?: any) {
    const t = tenant ?? (await this.userModel.findById(o.tenantId).lean());
    const profile = t?.tenantProfile;
    const firmName = profile?.businessName || 'Your firm';
    const recipients: { to: string; recipientName: string }[] = [];
    const owner = profile?.contactPerson?.email || t?.email;
    if (owner)
      recipients.push({
        to: owner,
        recipientName: profile?.contactPerson?.firstName || firmName,
      });
    if (o.responsibleId) {
      const r = await this.userModel
        .findById(o.responsibleId)
        .select('email firstName')
        .lean();
      if (r?.email && r.email !== owner)
        recipients.push({
          to: r.email,
          recipientName: r.firstName || o.responsibleName,
        });
    }
    await Promise.all(
      recipients.map((r) =>
        this.emailService
          .sendTaxObligationReminder({
            ...r,
            firmName,
            type: o.type,
            period: o.period,
            dueOn: o.dueOn,
            amount: o.amount,
            currency: o.currency,
          })
          .catch(() => undefined),
      ),
    );
  }

  private async getDoc(tenantId: string, id: string) {
    const o = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!o) throw new NotFoundException('Tax obligation not found');
    return o;
  }

  // Record the filing: the date, the amount paid, the return and the
  // proof of payment. The tenant owner's recording is final — the
  // obligation is Filed. Anyone else's goes to the owner for approval
  // first (the owner has the final say), so it sits as Pending approval.
  async recordFiling(
    tenantId: string,
    id: string,
    dto: RecordTaxFilingDto,
    files: RecordFilingFiles,
    actor: TaxActor,
  ) {
    const newFiles = [...(files.returnFile ?? []), ...(files.popFile ?? [])];
    const discard = () => newFiles.forEach((f) => removeFile(f.path));
    try {
      const o = await this.getDoc(tenantId, id);
      if (o.status === TaxObligationStatus.FILED)
        throw new ConflictException('This obligation is already filed.');
      if (o.status === TaxObligationStatus.PENDING_APPROVAL)
        throw new ConflictException(
          'This filing is already waiting for the owner to approve it.',
        );

      const filedOn = new Date(dto.filedOn);
      if (filedOn.getTime() > Date.now() + 86_400_000)
        throw new BadRequestException(
          'The filing date cannot be in the future.',
        );

      const prev = o.filing;
      const ret = files.returnFile?.[0];
      const pop = files.popFile?.[0];
      const toRef = (f: Express.Multer.File) => ({
        url: toFileUrl(f.path),
        name: f.originalname,
        mimeType: f.mimetype,
        path: f.path,
      });
      const returnFile = ret ? toRef(ret) : (prev?.returnFile ?? null);
      const popFile = pop ? toRef(pop) : (prev?.popFile ?? null);
      if (o.requireDocuments) {
        const missing = [
          !returnFile && 'the tax return',
          !popFile && 'the proof of payment',
        ].filter(Boolean);
        if (missing.length)
          throw new BadRequestException(
            `Attach ${missing.join(' and ')} before recording this filing.`,
          );
      }
      // Replaced files from an earlier (rejected) attempt go from disk.
      if (ret && prev?.returnFile) removeFile(prev.returnFile.path);
      if (pop && prev?.popFile) removeFile(prev.popFile.path);

      const now = new Date();
      const owner = isOwner(actor);
      o.filing = {
        filedOn,
        amountPaid: dto.amountPaid ?? 0,
        notes: dto.notes ?? '',
        returnFile,
        popFile,
        recordedById: actor.id,
        recordedByName: actor.name,
        recordedAt: now,
        approvedByName: owner ? actor.name : '',
        approvedAt: owner ? now : null,
        rejectedReason: '',
        rejectedAt: null,
      } as any;
      if (owner) {
        o.status = TaxObligationStatus.FILED;
        o.filedAt = filedOn;
      } else {
        o.status = TaxObligationStatus.PENDING_APPROVAL;
        o.filedAt = null;
      }
      await o.save();

      if (!owner) {
        this.eventEmitter.emit('finance.tax_filing_submitted', {
          tenantId,
          obligationId: String(o._id),
          type: o.type,
          period: o.period,
          submittedBy: actor.name,
        });
      }
      return this.normalize(o.toObject());
    } catch (err) {
      discard();
      throw err;
    }
  }

  // Final approval — the tenant owner only. Enforced here, not just
  // in the UI.
  async approveFiling(tenantId: string, id: string, actor: TaxActor) {
    if (!isOwner(actor))
      throw new ForbiddenException(
        'Only the account owner can approve a tax filing.',
      );
    const o = await this.getDoc(tenantId, id);
    if (o.status !== TaxObligationStatus.PENDING_APPROVAL || !o.filing)
      throw new ConflictException('There is no filing waiting for approval.');
    o.status = TaxObligationStatus.FILED;
    o.filedAt = o.filing.filedOn;
    o.filing.approvedByName = actor.name;
    o.filing.approvedAt = new Date();
    o.markModified('filing');
    await o.save();
    this.eventEmitter.emit('finance.tax_filing_decided', {
      tenantId,
      recipientId: o.filing.recordedById,
      decision: 'approved',
      type: o.type,
      period: o.period,
      reason: '',
    });
    return this.normalize(o.toObject());
  }

  async rejectFiling(
    tenantId: string,
    id: string,
    reason: string,
    actor: TaxActor,
  ) {
    if (!isOwner(actor))
      throw new ForbiddenException(
        'Only the account owner can send a tax filing back.',
      );
    const o = await this.getDoc(tenantId, id);
    if (o.status !== TaxObligationStatus.PENDING_APPROVAL || !o.filing)
      throw new ConflictException('There is no filing waiting for approval.');
    o.status = TaxObligationStatus.DRAFT;
    o.filedAt = null;
    o.filing.rejectedReason = reason.trim();
    o.filing.rejectedAt = new Date();
    o.markModified('filing');
    await o.save();
    this.eventEmitter.emit('finance.tax_filing_decided', {
      tenantId,
      recipientId: o.filing.recordedById,
      decision: 'sent back',
      type: o.type,
      period: o.period,
      reason: reason.trim(),
    });
    return this.normalize(o.toObject());
  }
}
