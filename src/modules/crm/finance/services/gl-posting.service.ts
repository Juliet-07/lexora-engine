import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GlEntry, GlEntryDocument, GlSource } from '../schemas';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { ExchangeRateService } from 'src/modules/hr/services/exchange-rate.service';

// A leaf, deliberately — InvoiceService, BillService,
// ExpenseClaimService, BankTransactionService and JournalService
// all need to post here, and several of those already import from
// each other. Keeping this dependency-free avoids yet another
// circular-import risk, same reasoning as WhtService.
@Injectable()
export class GlPostingService {
  constructor(
    @InjectModel(GlEntry.name)
    private readonly model: Model<GlEntryDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  async getBaseCurrency(tenantId: string): Promise<string> {
    const tenant = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.baseCurrency')
      .lean();
    return (tenant as any)?.tenantProfile?.baseCurrency || 'USD';
  }

  // Caller is responsible for the set of lines it passes balancing
  // (debits = credits) in their own original currency — this
  // converts every line into the tenant's base currency before
  // writing it, and always in that same currency, since a general
  // ledger only means anything if every line shares one currency.
  // sourceCurrency applies to the whole batch: every line in one
  // posting call comes from the same source document, so it's
  // always a single currency, never mixed per-line.
  async post(
    tenantId: string,
    entries: {
      date: Date;
      ref: string;
      description: string;
      accountCode: string;
      accountName: string;
      source: GlSource;
      debit?: number;
      credit?: number;
      sourceId?: Types.ObjectId | string | null;
    }[],
    sourceCurrency: string = 'USD',
  ) {
    const tId = new Types.ObjectId(tenantId);
    const baseCurrency = await this.getBaseCurrency(tenantId);
    const currency = (sourceCurrency || 'USD').toUpperCase();

    const { rate } =
      currency === baseCurrency
        ? { rate: 1 }
        : await this.exchangeRateService.getRate(currency, baseCurrency);

    await this.model.insertMany(
      entries.map((e) => {
        const originalDebit = e.debit ?? 0;
        const originalCredit = e.credit ?? 0;
        return {
          tenantId: tId,
          date: e.date,
          ref: e.ref,
          description: e.description,
          accountCode: e.accountCode,
          accountName: e.accountName,
          source: e.source,
          debit: Number((originalDebit * rate).toFixed(2)),
          credit: Number((originalCredit * rate).toFixed(2)),
          originalCurrency: currency,
          originalDebit,
          originalCredit,
          fxRateToBase: rate,
          sourceId: e.sourceId ? new Types.ObjectId(String(e.sourceId)) : null,
        };
      }),
    );
  }
}

// The well-known codes every automatic posting hook writes against.
// These are fixed, not tenant-configurable, for the automatic
// posting paths specifically — a tenant can still freely extend the
// Chart of Accounts for manual journals; automatic posting just
// needs to know where things land reliably.
export const GL_ACCOUNTS = {
  BANK_OPERATING: { code: '1110', name: 'Bank - operating' },
  BANK_TRUST: { code: '1120', name: 'Bank - trust (ring-fenced)' },
  BANK_FUND: { code: '1130', name: 'Bank - fund (ring-fenced)' },
  ACCOUNTS_RECEIVABLE: { code: '1200', name: 'Accounts receivable' },
  UNBILLED_WIP: { code: '1210', name: 'Unbilled WIP' },
  UNBILLED_DISBURSEMENTS: { code: '1220', name: 'Unbilled disbursements' },
  STAFF_ADVANCES: { code: '1240', name: 'Staff advances' },
  ACCUMULATED_DEPRECIATION: { code: '1490', name: 'Accumulated depreciation' },
  ACCOUNTS_PAYABLE: { code: '2110', name: 'Accounts payable' },
  PAYE_PAYABLE: { code: '2130', name: 'PAYE payable' },
  RSSB_PAYABLE: { code: '2140', name: 'RSSB payable' },
  VAT_PAYABLE: { code: '2150', name: 'VAT payable' },
  CLIENT_TRUST_LIABILITY: { code: '2170', name: 'Client trust liability' },
  LP_PAID_IN_CAPITAL: { code: '2160', name: 'LP paid-in capital' },
  WHT_PAYABLE: { code: '2190', name: 'WHT payable' },
  STAFF_REIMBURSEMENTS_PAYABLE: {
    code: '2180',
    name: 'Staff reimbursements payable',
  },
  REVENUE: { code: '4200', name: 'Fee income' },
  GENERAL_EXPENSE: { code: '5000', name: 'General expenses' },
  STAFF_COSTS: { code: '5800', name: 'Staff costs' },
  DEPRECIATION_EXPENSE: { code: '5900', name: 'Depreciation expense' },
} as const;
