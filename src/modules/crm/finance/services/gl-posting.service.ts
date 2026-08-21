import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GlEntry, GlEntryDocument, GlSource } from '../schemas';

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
  ) {}

  // Caller is responsible for the set of lines it passes balancing
  // (debits = credits) — this just writes them, it doesn't enforce
  // double-entry correctness itself. sourceId accepts a real
  // ObjectId directly (a Mongoose document's own _id) as well as a
  // string, since every caller here is passing a document's _id
  // straight through.
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
  ) {
    const tId = new Types.ObjectId(tenantId);
    await this.model.insertMany(
      entries.map((e) => ({
        tenantId: tId,
        date: e.date,
        ref: e.ref,
        description: e.description,
        accountCode: e.accountCode,
        accountName: e.accountName,
        source: e.source,
        debit: e.debit ?? 0,
        credit: e.credit ?? 0,
        sourceId: e.sourceId ? new Types.ObjectId(String(e.sourceId)) : null,
      })),
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
