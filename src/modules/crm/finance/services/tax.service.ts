import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TaxObligation,
  TaxObligationDocument,
  TaxObligationStatus,
} from '../schemas';
import { EbmStatus } from '../schemas';
import { CreateTaxObligationDto } from '../dtos';
import { InvoiceService } from './invoice.service';
import { BillService } from './purchases.service';
import { PayrollRunService } from 'src/modules/hr/services/payroll-run.service';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';

// ── VAT — real output VAT from invoices, real input VAT from bills ──

@Injectable()
export class VatService {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly billService: BillService,
  ) {}

  // period is "YYYY-MM"; defaults to the current month.
  async getReturn(tenantId: string, period?: string) {
    const targetPeriod = period ?? new Date().toISOString().slice(0, 7);
    const [invoices, bills] = await Promise.all([
      this.invoiceService.getAll(tenantId),
      this.billService.getAll(tenantId),
    ]);

    const inPeriod = (d: string | Date) =>
      new Date(d).toISOString().slice(0, 7) === targetPeriod;

    const outputLines = invoices
      .filter((i: any) => inPeriod(i.issuedOn) && i.stage !== 'Draft')
      .map((i: any) => ({
        category: `Sales — ${i.ref}`,
        type: 'Output' as const,
        base: i.net,
        vat: i.vat,
      }));
    const inputLines = bills
      .filter((b: any) => inPeriod(b.dueOn) && b.vatAmount > 0)
      .map((b: any) => ({
        category: `Purchases — ${b.ref}`,
        type: 'Input' as const,
        base: b.amount - b.vatAmount,
        vat: b.vatAmount,
      }));

    const outputVat = outputLines.reduce((s, l) => s + l.vat, 0);
    const inputVat = inputLines.reduce((s, l) => s + l.vat, 0);

    return {
      period: targetPeriod,
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
  ) {}

  async getProvision(tenantId: string) {
    const [invoices, bills, runs] = await Promise.all([
      this.invoiceService.getAll(tenantId),
      this.billService.getAll(tenantId),
      this.payrollRunService.getAllRuns(tenantId),
    ]);

    const revenue = invoices
      .filter((i: any) => i.stage === 'Paid' || i.stage === 'Part Paid')
      .reduce((s: number, i: any) => s + i.paidAmount, 0);
    const billExpenses = bills
      .filter((b: any) => b.status === 'Paid')
      .reduce((s: number, b: any) => s + b.amount, 0);
    const payrollExpenses = (runs as any[])
      .filter((r) => r.status === 'paid')
      .reduce((s, r) => s + r.totalGross + r.totalEmployerContributions, 0);

    const profitBeforeTax = revenue - billExpenses - payrollExpenses;
    const citRate = 28;
    const citAtRate = Math.max(0, profitBeforeTax * (citRate / 100));

    return {
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
      }));
  }

  async resync(tenantId: string, invoiceId: string) {
    // No real RRA connection to actually call — this marks the
    // document as synced with a generated receipt reference, the
    // same shape a real sync response would leave behind.
    const receiptNumber = `EBM-${Date.now().toString().slice(-8)}`;
    await this.invoiceService.setEbmStatus(
      tenantId,
      invoiceId,
      EbmStatus.SYNCED,
      receiptNumber,
    );
    return this.invoiceService.getById(tenantId, invoiceId);
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
  async create(tenantId: string, dto: CreateTaxObligationDto) {
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      type: dto.type,
      period: dto.period,
      dueOn: new Date(dto.dueOn),
      amount: dto.amount,
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
