import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TaxObligation,
  TaxObligationDocument,
  TaxObligationStatus,
  RecurringFrequency,
} from '../schemas';
import { EbmStatus } from '../schemas';
import { CreateTaxObligationDto } from '../dtos';
import { InvoiceService } from './invoice.service';
import { BillService } from './purchases.service';
import { PayrollRunService } from 'src/modules/hr/services/payroll-run.service';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { ExchangeRateService } from 'src/modules/hr/services/exchange-rate.service';
import {
  CalendarEvent,
  CalendarEventDocument,
  CalendarLayer,
  RecurrenceRule,
} from 'src/modules/crm/tools/schemas/calendar.schema';

// ── Recurring tax obligations — shared date/label math used both
// when a recurring obligation is first created and by
// TaxObligationReminderService when it rolls the chain forward. ──

export const FREQUENCY_MONTHS: Record<RecurringFrequency, number> = {
  [RecurringFrequency.MONTHLY]: 1,
  [RecurringFrequency.QUARTERLY]: 3,
  [RecurringFrequency.ANNUALLY]: 12,
};

export const FREQUENCY_CALENDAR_RULE: Record<
  RecurringFrequency,
  RecurrenceRule
> = {
  [RecurringFrequency.MONTHLY]: RecurrenceRule.MONTHLY,
  [RecurringFrequency.QUARTERLY]: RecurrenceRule.QUARTERLY,
  [RecurringFrequency.ANNUALLY]: RecurrenceRule.ANNUALLY,
};

export function addInterval(date: Date, frequency: RecurringFrequency): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + FREQUENCY_MONTHS[frequency]);
  return d;
}

export function periodLabelFor(
  date: Date,
  frequency: RecurringFrequency,
): string {
  const year = date.getFullYear();
  if (frequency === RecurringFrequency.ANNUALLY) return String(year);
  if (frequency === RecurringFrequency.QUARTERLY) {
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `${year}-Q${quarter}`;
  }
  return date.toISOString().slice(0, 7); // YYYY-MM
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
  ) {}

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ dueOn: 1 })
      .lean();
  }

  // Creating the obligation is the real reminder — an email goes
  // out immediately with the type, period, amount and due date. If
  // the send fails (bad address, SMTP hiccup) the obligation is
  // still created; the tenant sees it on the calendar regardless
  // and email delivery doesn't block the record existing.
  //
  // When recurring is set, this obligation is filed on the shared
  // Finance calendar (so it shows up alongside every other calendar
  // layer) and becomes the head of a chain: TaxObligationService
  // stores nextDueOn on it, and TaxObligationReminderService's daily
  // cron watches that date — once it's within the reminder window,
  // it creates the next period's obligation (repeating this same
  // create-time work: email + calendar entry) and rolls the chain
  // forward.
  async create(tenantId: string, dto: CreateTaxObligationDto) {
    const dueOn = new Date(dto.dueOn);
    const recurring = !!dto.recurring && !!dto.frequency;
    const nextDueOn = recurring ? addInterval(dueOn, dto.frequency!) : null;

    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      type: dto.type,
      period: dto.period,
      dueOn,
      amount: dto.amount,
      recurring,
      frequency: recurring ? dto.frequency : null,
      nextDueOn,
    });

    const tenant = await this.userModel.findById(tenantId).lean();
    const profile = tenant?.tenantProfile;
    const firmName = profile?.businessName || 'Your firm';
    const recipientEmail = profile?.contactPerson?.email || tenant?.email;
    const recipientName = profile?.contactPerson?.firstName || firmName;

    if (recipientEmail) {
      await this.emailService
        .sendTaxObligationReminder({
          to: recipientEmail,
          recipientName,
          firmName,
          type: dto.type,
          period: dto.period,
          dueOn: created.dueOn,
          amount: dto.amount,
        })
        .catch(() => undefined);
    }

    if (recurring) {
      await this.calendarEventModel
        .create({
          tenantId: new Types.ObjectId(tenantId),
          title: `${dto.type} due — ${dto.period}`,
          date: created.dueOn.toISOString().slice(0, 10),
          time: '09:00',
          layer: CalendarLayer.FINANCE,
          recurrence: FREQUENCY_CALENDAR_RULE[dto.frequency!],
          createdBy: firmName,
          sourceType: 'TaxObligation',
          sourceId: created._id,
        })
        .catch(() => undefined);
    }

    return created.toObject();
  }

  async file(tenantId: string, id: string) {
    const o = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!o) throw new NotFoundException('Tax obligation not found');
    o.status = TaxObligationStatus.FILED;
    o.filedAt = new Date();
    await o.save();
    return o.toObject();
  }
}
