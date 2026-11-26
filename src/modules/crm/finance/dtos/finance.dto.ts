import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsInt,
  IsBoolean,
  IsDateString,
  IsMongoId,
  IsObject,
  IsArray,
  ValidateNested,
  IsEmail,
  Min,
  Max,
  Length,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { BillingModel } from '../schemas';
import { PaymentMethod } from '../schemas';
import { QuoteKind } from '../schemas';
import { RecurringFrequency } from '../schemas';
import { BankAccountType, TxLinkType } from '../schemas';
import {
  TaxObligationType,
  TaxPeriodType,
  TaxPriority,
  TaxRecurrence,
} from '../schemas';
import { AccountType, AssetKind, JournalType } from '../schemas';
import { FundStatus } from '../schemas';
import { WaterfallType, CommitmentType, DistributionSource } from '../schemas';
import { ComplianceFrequency } from '../schemas';
import { ValuationMethod, IfrsLevel } from '../schemas';
import {
  InterestTreatment,
  TrustLedgerStatus,
  TrustRiskLevel,
  TrustPortalAccess,
  TrustDrawdownType,
} from '../schemas';
import { ClientInvoiceAction } from '../schemas';
import {
  SideLetterStatus,
  SideLetterMfn,
  ProvisionCompliance,
  MfnElectionStatus,
} from '../schemas';
import { ExpenseCategory, BillPayeeType } from '../schemas';
import {
  CeoMessageStatus,
  ReportActionPriority,
  ReportSeverity,
} from '../schemas';

// ── Invoices ──────────────────────────────────────────────────

export class InvoiceLineDto {
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsNumber() @Min(0) qty: number;
  @ApiProperty() @IsNumber() @Min(0) unit: number;
}

export class CreateInvoiceDto {
  @ApiProperty() @IsMongoId() mandateId: string;
  @ApiProperty({ enum: BillingModel })
  @IsEnum(BillingModel)
  model: BillingModel;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() vatRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() whtRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() discount?: number;
  @ApiProperty() @IsDateString() dueOn: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() proforma?: boolean;
  @ApiProperty({ type: [InvoiceLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];
}

// Real WIP entries selected off the register — the description on
// each line is taken from the entry's own narrative/task, not typed
// freehand, so the invoice reflects what was actually done.
export class CreateInvoiceFromWipDto {
  @ApiProperty() @IsMongoId() mandateId: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  timeEntryIds?: string[];
  // Real rechargeable, approved expense claims pulled in as
  // disbursement lines — the WIP register's other real half, not a
  // separate invoicing flow.
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  expenseClaimIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() vatRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() whtRate?: number;
  @ApiProperty() @IsDateString() dueOn: string;
}

export class RecordPaymentDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.01) amount?: number;
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;
  // Which real bank account the money landed in. Optional — when
  // omitted, the account is auto-picked by matching the invoice's
  // currency (see InvoiceService.pickBankAccount); pass this to
  // override that when the payment actually landed somewhere else.
  @ApiPropertyOptional() @IsOptional() @IsMongoId() bankAccountId?: string;
}

export class AddDunningEventDto {
  @ApiProperty() @IsString() action: string;
  @ApiProperty() @IsString() by: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class WriteOffInvoiceDto {
  @ApiProperty() @IsString() reason: string;
  @ApiProperty() @IsString() approvedBy: string;
}

export class CancelInvoiceDto {
  @ApiProperty() @IsString() reason: string;
}

// ── Credit notes ──────────────────────────────────────────────

export class CreateCreditNoteDto {
  @ApiProperty() @IsMongoId() invoiceId: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiProperty() @IsString() reason: string;
  @ApiProperty() @IsString() approvedBy: string;
}

// ── Quotes ────────────────────────────────────────────────────

export class CreateQuoteDto {
  // Optional — a quote can be written for a prospect who isn't a
  // registered client. clientName is required either way.
  @ApiPropertyOptional() @IsOptional() @IsMongoId() clientUserId?: string;
  @ApiProperty() @IsString() clientName: string;
  // Required whenever clientUserId isn't set — validated in the
  // service, since it depends on that other field.
  @ApiPropertyOptional() @IsOptional() @IsEmail() clientEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() mandateId?: string;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() termsAndConditions?: string;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vatPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiProperty() @IsDateString() expires: string;
  @ApiProperty({ enum: QuoteKind }) @IsEnum(QuoteKind) kind: QuoteKind;
}

export class SetQuoteMandateDto {
  @ApiProperty() @IsMongoId() mandateId: string;
}

// ── Recurring invoices ───────────────────────────────────────

export class CreateRecurringInvoiceDto {
  @ApiProperty() @IsMongoId() clientUserId: string;
  @ApiProperty() @IsString() clientName: string;
  @ApiProperty() @IsMongoId() mandateId: string;
  @ApiProperty() @IsString() mandateName: string;
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiProperty({ enum: RecurringFrequency })
  @IsEnum(RecurringFrequency)
  frequency: RecurringFrequency;
  @ApiProperty() @IsDateString() nextRun: string;
}

// ── Payment plans ─────────────────────────────────────────────

export class InstalmentInputDto {
  @ApiProperty() @IsDateString() due: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
}

export class CreatePaymentPlanDto {
  @ApiProperty() @IsMongoId() invoiceId: string;
  @ApiProperty({ type: [InstalmentInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InstalmentInputDto)
  instalments: InstalmentInputDto[];
}

// ── Purchases: vendors ────────────────────────────────────────

// ── Purchases: purchase orders ───────────────────────────────

export class PoLineDto {
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsNumber() @Min(0) qty: number;
  @ApiProperty() @IsNumber() @Min(0) unit: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) discountPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() taxLabel?: string;
}

export class CreatePurchaseOrderDto {
  @ApiProperty() @IsMongoId() vendorId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedDelivery?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deliveryAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deliveryAttention?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deliveryPhone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryInstructions?: string;
  @ApiProperty({ type: [PoLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PoLineDto)
  lines: PoLineDto[];
}

// Editing a PO — every field optional; whatever is sent replaces the
// stored value (lines are replaced as a whole set when provided).
export class UpdatePurchaseOrderDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() vendorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedDelivery?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deliveryAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deliveryAttention?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deliveryPhone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryInstructions?: string;
  @ApiPropertyOptional({ type: [PoLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PoLineDto)
  lines?: PoLineDto[];
}

// ── Purchases: bills ──────────────────────────────────────────

export class CreateBillDto {
  // Optional — a bill can record a general expense with no formal
  // vendor relationship. When vendorId is omitted, vendorName is
  // required as the free-text payee label instead. Not used at all
  // when payeeType is BoardMember (boardMemberId takes over).
  @ApiPropertyOptional() @IsOptional() @IsMongoId() vendorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vendorName?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() poId?: string;
  // "There should be a flow for board member [in Capture Bill]"
  // (PO, Oct 2026) — paying a director instead of a vendor.
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(BillPayeeType)
  payeeType?: BillPayeeType;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() boardMemberId?: string;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiProperty() @IsDateString() dueOn: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() recurring?: boolean;
}

export class SchedulePaymentDto {
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional() @IsOptional() @IsString() time?: string;
}

// ── Purchases: expense claims ────────────────────────────────

export class CreateExpenseClaimDto {
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() mandateId?: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() rechargeable?: boolean;
}

// Board portal, self-service — "Expense claim submission in board
// portal should be multi-currency. When the user clicks other in
// the form for submission, it should bring a field where the user
// must specify what the expense claim is for" (PO, Oct 2026).
// otherCategoryDetail's required-when-Other rule is enforced in the
// service (ExpenseClaimService#createAsBoardMember), not here, since
// class-validator's conditional decorators read worse than a plain
// if-check against a sibling field.
export class SubmitMyExpenseClaimDto {
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() otherCategoryDetail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() relatedMeetingLabel?: string;
}

// ── Purchases: expense policies ──────────────────────────────

export class UpsertExpensePolicyDto {
  @ApiProperty() @IsString() rule: string;
  @ApiProperty() @IsString() value: string;
}

// ── Banking ───────────────────────────────────────────────────

export class CreateBankAccountDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() bank: string;
  @ApiProperty() @IsString() last4: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() openingBalance?: number;
  @ApiProperty({ enum: BankAccountType })
  @IsEnum(BankAccountType)
  type: BankAccountType;
}

export class CreateBankTransactionDto {
  @ApiProperty() @IsMongoId() accountId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsNumber() amount: number;
}

// Everything optional — only what is sent changes.
export class UpdateBankAccountDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bank?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() last4?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() openingBalance?: number;
  @ApiPropertyOptional({ enum: BankAccountType })
  @IsOptional()
  @IsEnum(BankAccountType)
  type?: BankAccountType;
}

export class UpdateBankTransactionDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() accountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() amount?: number;
}

export class MatchTransactionDto {
  @ApiProperty({ enum: TxLinkType }) @IsEnum(TxLinkType) linkType: TxLinkType;
  // Required for every link type except Manual, where there's no
  // real record to reference — validated in the service, since
  // that depends on linkType.
  @ApiPropertyOptional() @IsOptional() @IsString() linkId?: string;
  @ApiProperty() @IsString() linkLabel: string;
}

export class CreateBankRuleDto {
  @ApiProperty() @IsString() matchText: string;
  @ApiProperty() @IsString() account: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() auto?: boolean;
}

export class UpdateBankRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() matchText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() account?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() auto?: boolean;
}

export class CreateTransferDto {
  @ApiProperty() @IsMongoId() fromAccountId: string;
  @ApiProperty() @IsMongoId() toAccountId: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiProperty() @IsString() authoriser: string;
}

export class SetStatementBalanceDto {
  @ApiProperty() @IsNumber() statementBalance: number;
  @ApiProperty() @IsString() preparedBy: string;
}

export class SignOffReconciliationDto {
  @ApiProperty() @IsString() signedOffBy: string;
}

// ── Tax ───────────────────────────────────────────────────────

export class CreateTaxObligationDto {
  @ApiProperty({ enum: TaxObligationType })
  @IsEnum(TaxObligationType)
  type: TaxObligationType;
  @ApiPropertyOptional({
    description: 'Defaults to "<type> — <period>"',
  })
  @IsOptional()
  @IsString()
  name?: string;
  @ApiPropertyOptional({ description: 'Tax authority / jurisdiction code' })
  @IsOptional()
  @IsString()
  jurisdiction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;

  // The period being filed for. Monthly/quarterly/annual obligations
  // give the year (+ month or quarter) and the label is built from
  // them, so the Filing Archive and the recurring chain stay exact.
  // Once-off obligations give their own label in `period`.
  @ApiProperty({ enum: TaxPeriodType })
  @IsEnum(TaxPeriodType)
  periodType: TaxPeriodType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(2000) periodYear?: number;
  @ApiPropertyOptional({ description: '1–12, monthly periods' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth?: number;
  @ApiPropertyOptional({ description: '1–4, quarterly periods' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  periodQuarter?: number;
  @ApiPropertyOptional({ description: 'Label for once-off obligations' })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiProperty() @IsDateString() dueOn: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) amount?: number;
  @ApiPropertyOptional({ description: 'A team member (User id)' })
  @IsOptional()
  @IsMongoId()
  responsibleId?: string;
  @ApiPropertyOptional({ enum: TaxPriority })
  @IsOptional()
  @IsEnum(TaxPriority)
  priority?: TaxPriority;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional({
    description:
      'Require the return and the proof of payment before a filing can be recorded (default true)',
  })
  @IsOptional()
  @IsBoolean()
  requireDocuments?: boolean;

  // Recurring: only a frequency and the day of the month it falls due.
  // Draft entries and filing reminders are handled by the backend.
  @ApiPropertyOptional() @IsOptional() @IsBoolean() recurring?: boolean;
  @ApiPropertyOptional({ enum: TaxRecurrence })
  @IsOptional()
  @IsEnum(TaxRecurrence)
  frequency?: TaxRecurrence;
  @ApiPropertyOptional({ description: '1–31 (31 = last day of the month)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay?: number;
}

// Recording a filing: multipart, with the return and the proof of
// payment as files (`returnFile`, `popFile`).
export class RecordTaxFilingDto {
  @ApiProperty() @IsDateString() filedOn: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountPaid?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class RejectTaxFilingDto {
  @ApiProperty() @IsString() reason: string;
}

export class UpdateEbmReceiptDto {
  @ApiProperty({
    description: 'The real receipt number read off the EBM device/slip',
  })
  @IsString()
  receiptNumber: string;
}

// ── Accounting: chart of accounts ────────────────────────────

export class CreateAccountDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: AccountType }) @IsEnum(AccountType) type: AccountType;
  @ApiPropertyOptional() @IsOptional() @IsString() subGroup?: string;
}

// ── Accounting: journals (real multi-line double-entry) ──────

export class JournalLineDto {
  @ApiProperty() @IsString() accountCode: string;
  @ApiProperty() @IsString() accountName: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) debit?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) credit?: number;
}

export class CreateJournalDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty({ enum: JournalType }) @IsEnum(JournalType) type: JournalType;
  @ApiProperty() @IsString() narration: string;
  @ApiProperty() @IsString() preparedBy: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiProperty({ type: [JournalLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];
}

export class PostJournalDto {
  @ApiProperty() @IsString() postedBy: string;
}

// ── Accounting: find & recode ────────────────────────────────

export class RecodeTransactionDto {
  @ApiProperty() @IsString() ledgerAccount: string;
}

// ── Accounting: period-end close ─────────────────────────────

export class CompletePeriodStepDto {
  @ApiProperty() @IsString() completedBy: string;
}

export class MarkStepNotApplicableDto {
  @ApiProperty({
    description:
      'Why this step never applies to this tenant, e.g. "No Trust account"',
  })
  @IsString()
  reason: string;
  @ApiProperty() @IsString() by: string;
}

export class LockPeriodDto {
  @ApiProperty() @IsString() lockedBy: string;
}

export class OverridePeriodLockDto {
  @ApiProperty() @IsString() by: string;
  @ApiProperty() @IsString() reason: string;
}

// ── Asset register ────────────────────────────────────────────

export class CreateAssetDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() category: string;
  @ApiProperty({ enum: AssetKind }) @IsEnum(AssetKind) kind: AssetKind;
  @ApiProperty() @IsNumber() @Min(0) cost: number;
  @ApiProperty() @IsDateString() acquiredOn: string;
  @ApiProperty() @IsNumber() @Min(1) usefulLifeYears: number;
  @ApiPropertyOptional() @IsOptional() @IsString() assignedTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() condition?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() insurer?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() renewalDate?: string;
}

export class DisposeAssetDto {
  @ApiProperty() @IsNumber() @Min(0) disposalValue: number;
}

export class CreateMaintenanceLogDto {
  @ApiProperty() @IsMongoId() assetId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vendor?: string;
  @ApiProperty() @IsNumber() @Min(0) cost: number;
}

// ── Remittance accounts ──────────────────────────────────────

export class CreateRemittanceAccountDto {
  @ApiProperty() @IsString() accountName: string;
  @ApiProperty() @IsString() bankName: string;
  @ApiProperty() @IsString() accountNumber: string;
  @ApiProperty() @IsString() currency: string;
  @ApiPropertyOptional() @IsOptional() @IsString() branchCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() swiftCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class SetClientInvoiceStatusDto {
  @ApiProperty({ enum: ClientInvoiceAction })
  @IsEnum(ClientInvoiceAction)
  action: ClientInvoiceAction;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

// ── Fund accounting ────────────────────────────────────────────

export class CreateFundDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() structure?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jurisdiction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() strategy?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) targetSize?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() vintage?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() bankAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) mgmtFeePct?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) carryPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) hurdlePct?: number;
  @ApiPropertyOptional({ enum: WaterfallType })
  @IsOptional()
  @IsEnum(WaterfallType)
  waterfallType?: WaterfallType;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultInterestPct?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  curePeriodDays?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  forfeiturePct?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  equalisationInterestPct?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  carryEscrowPct?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  investmentPeriodEndDate?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  orgCostsCapAmount?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  recyclingPermitted?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  recyclingCapPct?: number;

  // LPA particulars
  @ApiPropertyOptional() @IsOptional() @IsString() gpEntityName?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() lpaDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() firstCloseDate?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  finalCloseDeadline?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) termYears?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() lpaCallClause?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lpaDefaultInterestClause?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lpaDefaultClause?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  gpCommitmentPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() wireBeneficiary?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() wireBankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() wireAccountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() wireSwift?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() wireBranch?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() noticeSignatory?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  noticeSignatoryTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() administratorEmail?: string;
}

export class UpdateFundTermsDto extends CreateFundDto {}

export class SetFundStatusDto {
  @ApiProperty({ enum: FundStatus }) @IsEnum(FundStatus) status: FundStatus;
}

export class CreateCapitalCommitmentDto {
  @ApiProperty() @IsMongoId() lpUserId: string;
  @ApiProperty() @IsString() lpName: string;
  @ApiProperty() @IsNumber() @Min(0.01) commitment: number;
  @ApiPropertyOptional({ enum: CommitmentType })
  @IsOptional()
  @IsEnum(CommitmentType)
  type?: CommitmentType;
  @ApiPropertyOptional() @IsOptional() @IsString() closeLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() closeDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isGpCommitment?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasSideLetter?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  mgmtFeePctOverride?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() sideLetterNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() lpEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() amlKycStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subscriptionStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
}

export class UpdateCapitalCommitmentDto {
  @ApiPropertyOptional() @IsOptional() @IsEmail() lpEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() amlKycStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subscriptionStatus?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(CommitmentType)
  type?: CommitmentType;
}

export class CallUseOfProceedsDto {
  @ApiProperty() @IsString() label: string;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
  @ApiPropertyOptional({ description: "'fee' follows each LP's own fee rate" })
  @IsOptional()
  @IsString()
  kind?: string;
}

export class CreateCapitalCallDto {
  @ApiProperty() @IsString() purpose: string;
  @ApiProperty() @IsNumber() @Min(0.01) totalAmount: number;
  @ApiProperty() @IsDateString() issuedOn: string;
  @ApiProperty() @IsDateString() dueOn: string;
  @ApiPropertyOptional() @IsOptional() @IsString() purposeCategory?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dealName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() narrative?: string;
  @ApiPropertyOptional({ type: [CallUseOfProceedsDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CallUseOfProceedsDto)
  useOfProceeds?: CallUseOfProceedsDto[];
  @ApiPropertyOptional({ description: 'Save as a draft instead of issuing' })
  @IsOptional()
  @IsBoolean()
  saveAsDraft?: boolean;
}

export class SendCallNoticesDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Commitments to notify (default: every LP on the call)',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  commitmentIds?: string[];
  @ApiPropertyOptional({
    description:
      'Email with PDF attachment | Email with link to portal | Email + portal notification',
  })
  @IsOptional()
  @IsString()
  method?: string;
  @ApiPropertyOptional({ description: 'Defaults to sending now' })
  @IsOptional()
  @IsDateString()
  sendAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() message?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() attachStatement?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ccAdministrator?: boolean;
}

export class RecordCallFundingDto {
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
}

export class CureDefaultDto {
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
}

export class ApplyEqualisationDto {}

export class RecordDistributionDto {
  @ApiProperty() @IsNumber() @Min(0.01) totalAmount: number;
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional({ enum: DistributionSource })
  @IsOptional()
  @IsEnum(DistributionSource)
  source?: DistributionSource;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceDescription?: string;
}

export class CreatePortfolioHoldingDto {
  @ApiProperty() @IsString() companyName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sector?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiProperty() @IsDateString() entryDate: string;
  @ApiProperty() @IsNumber() @Min(0.01) costBasis: number;
}

export class RecordExitDto {
  @ApiProperty() @IsDateString() exitedAt: string;
  @ApiProperty() @IsNumber() @Min(0) exitProceeds: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  recycledAmount?: number;
}

export class ProposeValuationDto {
  @ApiProperty({ enum: ValuationMethod })
  @IsEnum(ValuationMethod)
  method: ValuationMethod;
  @ApiPropertyOptional({ enum: IfrsLevel })
  @IsOptional()
  @IsEnum(IfrsLevel)
  ifrsLevel?: IfrsLevel;
  @ApiPropertyOptional() @IsOptional() @IsString() keyInput?: string;
  @ApiProperty() @IsNumber() @Min(0) proposedValue: number;
  @ApiProperty() @IsString() proposedBy: string;
}

export class ReviewValuationDto {
  @ApiProperty() @IsNumber() @Min(0) reviewedValue: number;
  @ApiPropertyOptional() @IsOptional() @IsString() reviewNotes?: string;
  @ApiProperty() @IsString() reviewedBy: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  methodologyChanged?: boolean;
}

export class ApproveValuationDto {
  @ApiProperty() @IsString() approvedBy: string;
}

export class RecordFundExpenseDto {
  @ApiProperty() @IsString() category: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOrganisationalCost?: boolean;
}

export class ChargeManagementFeeDto {
  @ApiProperty() @IsDateString() asOfDate: string;
}

// ── Fund compliance ──────────────────────────────────────────────

export class AddKeyPersonDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() role: string;
  @ApiProperty() @IsNumber() @Min(0) timeThresholdPct: number;
}

export class AddComplianceCalendarItemDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: ComplianceFrequency })
  @IsEnum(ComplianceFrequency)
  frequency: ComplianceFrequency;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  daysAfterPeriodEnd?: number;
}

export class MarkComplianceCompleteDto {
  @ApiProperty() @IsString() period: string;
}

// ── Fund multi-currency (FX rates) ───────────────────────────────

export class RecordFxRateDto {
  @ApiProperty() @IsString() fromCurrency: string;
  @ApiProperty() @IsString() toCurrency: string;
  @ApiProperty() @IsNumber() @Min(0) rate: number;
  @ApiProperty() @IsDateString() asOfDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() source?: string;
}

// ── Fund scenarios ────────────────────────────────────────────────

export class ScenarioHoldingValueDto {
  @ApiProperty() @IsString() holdingId: string;
  @ApiProperty() @IsNumber() @Min(0) exitValue: number;
}

export class RunScenarioDto {
  @ApiPropertyOptional({ type: [ScenarioHoldingValueDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScenarioHoldingValueDto)
  holdingExitValues?: ScenarioHoldingValueDto[];
}

// ── Trust accounting ──────────────────────────────────────────

// Multipart forms arrive as strings, and with implicit conversion on
// "false" would become true — read booleans explicitly.
const toBool = ({ value }: { value: any }) =>
  value === true || value === 'true' || value === '1' || value === 1;

export class TrustNotifyPrefsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  depositConfirmations?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() drawdownNotices?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() monthlyStatements?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() lowBalanceAlerts?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() interestCredits?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reconciliationReports?: boolean;
}

export class CreateTrustLedgerDto {
  @ApiProperty() @IsMongoId() bankAccountId: string;
  @ApiProperty() @IsMongoId() clientUserId: string;
  @ApiProperty() @IsString() clientName: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() mandateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mandateName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mandateReference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(InterestTreatment)
  interestTreatment?: InterestTreatment;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  interestRate?: number;

  // Source of funds (AML/CFT)
  @ApiPropertyOptional() @IsOptional() @IsString() sourceOfFunds?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expectedPurpose?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceOfFundsNotes?: string;

  // Controls & restrictions
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(TrustRiskLevel)
  riskLevel?: TrustRiskLevel;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDrawdownPerRequest?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() invoiceLinkedOnly?: boolean;
  @ApiPropertyOptional({ description: 'Create the ledger frozen' })
  @IsOptional()
  @IsBoolean()
  frozen?: boolean;

  // Retainer replenishment
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) minBalance?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  replenishmentTarget?: number;

  // Client portal & notifications
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(TrustPortalAccess)
  portalAccess?: TrustPortalAccess;
  @ApiPropertyOptional() @IsOptional() @IsEmail() portalContactEmail?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  additionalPortalUsers?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() emailDigest?: string;
  @ApiPropertyOptional({ type: TrustNotifyPrefsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TrustNotifyPrefsDto)
  notifyPrefs?: TrustNotifyPrefsDto;
}

// Everything on a ledger the firm can change after creation. The
// bank account, client and currency are fixed — changing them would
// rewrite what the existing movements mean.
export class UpdateTrustLedgerDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() mandateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mandateName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mandateReference?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(InterestTreatment)
  interestTreatment?: InterestTreatment;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  interestRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceOfFunds?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expectedPurpose?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceOfFundsNotes?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(TrustRiskLevel)
  riskLevel?: TrustRiskLevel;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDrawdownPerRequest?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() invoiceLinkedOnly?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) minBalance?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  replenishmentTarget?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(TrustPortalAccess)
  portalAccess?: TrustPortalAccess;
  @ApiPropertyOptional() @IsOptional() @IsEmail() portalContactEmail?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  additionalPortalUsers?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() emailDigest?: string;
  @ApiPropertyOptional({ type: TrustNotifyPrefsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TrustNotifyPrefsDto)
  notifyPrefs?: TrustNotifyPrefsDto;
}

export class TrustLedgerStatusDto {
  @ApiProperty({ enum: TrustLedgerStatus })
  @IsEnum(TrustLedgerStatus)
  status: TrustLedgerStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

// A deposit is declared with where the money came from — the
// source-of-funds record AML/CFT inspection asks for first. Sent as
// multipart so the evidence (wire confirmation, bank statement
// extract) travels with the movement it supports.
export class RecordTrustDepositDto {
  @ApiProperty() @IsMongoId() ledgerId: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) amount: number;
  @ApiProperty({ description: 'Bank reference / receipt number' })
  @IsString()
  reference: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional() @IsOptional() @IsString() remitterName?: string;
  @ApiProperty() @IsString() sourceOfFunds: string;
  @ApiPropertyOptional() @IsOptional() @IsString() purpose?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() internalNotes?: string;
  // Kept for older callers — the real preparer is always the signed-in user.
  @ApiPropertyOptional() @IsOptional() @IsString() preparedBy?: string;
}

export class RequestTrustDrawdownDto {
  @ApiProperty() @IsMongoId() ledgerId: string;
  @ApiProperty({ enum: TrustDrawdownType })
  @IsEnum(TrustDrawdownType)
  drawdownType: TrustDrawdownType;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) amount: number;

  // The source document — which of these applies depends on the type.
  @ApiPropertyOptional() @IsOptional() @IsMongoId() linkedInvoiceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() linkedBillId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() mandateId?: string;
  @ApiPropertyOptional({ description: 'Original deposit being refunded' })
  @IsOptional()
  @IsMongoId()
  linkedDepositId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() payeeName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expenseCategory?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() requestedDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentMethod?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() beneficiaryAccount?: string;
  @ApiPropertyOptional({
    description:
      'Invoice / trust-to-office drawdowns: the office bank account the fees land in (default: the first non-trust account in the ledger currency)',
  })
  @IsOptional()
  @IsMongoId()
  officeBankAccountId?: string;
  @ApiProperty({ description: 'Purpose / narrative' })
  @IsString()
  narrative: string;
  @ApiPropertyOptional() @IsOptional() @IsString() internalNotes?: string;

  @ApiPropertyOptional({ description: 'Save without submitting for approval' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  saveAsDraft?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() preparedBy?: string;
}

export class AuthoriseTrustDrawdownDto {
  @ApiPropertyOptional() @IsOptional() @IsString() authorisedBy?: string;
}

export class RejectTrustDrawdownDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class CreditTrustInterestDto {
  @ApiPropertyOptional({
    description: 'Credit up to and including this date (default: yesterday)',
  })
  @IsOptional()
  @IsDateString()
  through?: string;
}

export class EmailTrustStatementsDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Only these ledgers (default: every ledger with a contact)',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  ledgerIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

// ── Budget ──────────────────────────────────────────────────────

export class BudgetLineDto {
  @ApiProperty() @IsString() accountCode: string;
  @ApiProperty() @IsString() accountName: string;
  @ApiProperty() @IsNumber() budgetedAmount: number;
}

export class UpsertBudgetDto {
  @ApiProperty({ type: [BudgetLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetLineDto)
  lines: BudgetLineDto[];
}

// ── Management reporting ─────────────────────────────────────

export class SaveExecutiveSummaryDto {
  @ApiProperty() @IsString() executiveSummary: string;
}

export class EmailManagementReportDto {
  @ApiProperty() @IsString() recipientName: string;
  @ApiProperty() @IsEmail() recipientEmail: string;
  @ApiProperty() @IsString() subject: string;
  @ApiPropertyOptional() @IsOptional() @IsString() displayCurrency?: string;
}

export class EmailBoardReportDto {
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() displayCurrency?: string;
}

export class ReportCommentaryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() ceoMessage?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() revenue?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() costs?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cashflow?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() receivables?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() payables?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() budget?: string;
}

export class ReportRiskDto {
  @ApiProperty({ enum: ReportSeverity })
  @IsEnum(ReportSeverity)
  severity: ReportSeverity;
  @ApiProperty() @IsString() text: string;
  @ApiPropertyOptional() @IsOptional() @IsString() impact?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() likelihood?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mitigation?: string;
}

export class ReportActionDto {
  @ApiProperty({ enum: ReportActionPriority })
  @IsEnum(ReportActionPriority)
  priority: ReportActionPriority;
  @ApiProperty() @IsString() text: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() due?: string;
}

// Every part is optional: each tab of the report saves only what it
// owns (one section's commentary, the risk register, or the actions).
export class SaveReportContentDto {
  @ApiPropertyOptional({ type: ReportCommentaryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReportCommentaryDto)
  commentary?: ReportCommentaryDto;

  @ApiPropertyOptional({ enum: CeoMessageStatus })
  @IsOptional()
  @IsEnum(CeoMessageStatus)
  ceoMessageStatus?: CeoMessageStatus;

  @ApiPropertyOptional({ type: [ReportRiskDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReportRiskDto)
  risks?: ReportRiskDto[];

  @ApiPropertyOptional({ type: [ReportActionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReportActionDto)
  actions?: ReportActionDto[];
}

export class SetBaseCurrencyDto {
  @ApiProperty({ example: 'RWF', description: '3-letter currency code' })
  @IsString()
  @Length(3, 3)
  baseCurrency: string;
}

// ── Fund: statements, LP reports, side letters, documents ───────

export class GenerateStatementsDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Only these LPs (default: every LP in the fund)',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  commitmentIds?: string[];
  @ApiPropertyOptional({
    description: "'2026-Q4', 'FY 2026', 'YTD', 'ITD' or 'custom'",
  })
  @IsOptional()
  @IsString()
  period?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ enum: ['pdf', 'xlsx', 'both'] })
  @IsOptional()
  @IsString()
  format?: string;
  @ApiPropertyOptional({
    description: "'download' | 'email' | 'portal' | 'email+portal'",
  })
  @IsOptional()
  @IsString()
  delivery?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() metrics?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() contributions?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() fees?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() gains?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() comparative?: boolean;
}

export class GenerateLpReportDto {
  @ApiProperty() @IsString() reportType: string;
  @ApiPropertyOptional() @IsOptional() @IsString() period?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({
    description: "'all' | 'lpac' | a commitment id",
  })
  @IsOptional()
  @IsString()
  recipients?: string;
  @ApiPropertyOptional({ enum: ['pdf', 'xlsx', 'both'] })
  @IsOptional()
  @IsString()
  format?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sections?: string[];
  @ApiPropertyOptional({
    description:
      "'Generate only (download)' | 'Generate & email to LPs' | 'Generate & upload to LP portal'",
  })
  @IsOptional()
  @IsString()
  delivery?: string;
  @ApiPropertyOptional({ description: "'fund' | 'gp' | 'none'" })
  @IsOptional()
  @IsString()
  branding?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() commentary?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() callId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() distributionId?: string;
}

export class SendFundReportDto {
  @ApiPropertyOptional() @IsOptional() @IsString() recipients?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() delivery?: string;
}

export class UploadFundReportDto {
  @ApiProperty() @IsString() reportType: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() period?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recipients?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() delivery?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() commentary?: string;
}

export class SideLetterProvisionDto {
  @ApiProperty() @IsString() type: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lpaDefault?: string;
  @ApiProperty() @IsString() term: string;
  @ApiPropertyOptional({ enum: SideLetterMfn })
  @IsOptional()
  @IsEnum(SideLetterMfn)
  mfn?: SideLetterMfn;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional({
    description: 'For a management fee reduction: the rate it sets, in percent',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  feePct?: number;
}

export class CreateSideLetterDto {
  @ApiProperty() @IsMongoId() commitmentId: string;
  @ApiProperty() @IsDateString() effectiveDate: string;
  @ApiPropertyOptional({ enum: SideLetterStatus })
  @IsOptional()
  @IsEnum(SideLetterStatus)
  status?: SideLetterStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  mfnElectionDeadline?: string;
  @ApiProperty({ type: [SideLetterProvisionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SideLetterProvisionDto)
  provisions: SideLetterProvisionDto[];
}

export class UpdateSideLetterDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveDate?: string;
  @ApiPropertyOptional({ enum: SideLetterStatus })
  @IsOptional()
  @IsEnum(SideLetterStatus)
  status?: SideLetterStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  mfnElectionDeadline?: string;
  @ApiPropertyOptional({ type: [SideLetterProvisionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SideLetterProvisionDto)
  provisions?: SideLetterProvisionDto[];
}

export class SetProvisionComplianceDto {
  @ApiProperty({ enum: ProvisionCompliance })
  @IsEnum(ProvisionCompliance)
  compliance: ProvisionCompliance;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class RecordMfnElectionDto {
  @ApiProperty({ enum: MfnElectionStatus })
  @IsEnum(MfnElectionStatus)
  status: MfnElectionStatus;
}

export class UploadFundDocumentDto {
  @ApiProperty() @IsString() category: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsDateString() docDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() version?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() commitmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() holdingId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() confidentiality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() authority?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() filedOn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class DraftFundDocumentDto {
  @ApiPropertyOptional({
    description: 'A built-in template key, or a platform template id',
  })
  @IsOptional()
  @IsString()
  templateKey?: string;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() commitmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() callId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() distributionId?: string;
  @ApiPropertyOptional({ description: 'Starting text for a blank document' })
  @IsOptional()
  @IsString()
  initialContent?: string;
}

export class UpdateFundDocumentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() version?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() confidentiality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() docDate?: string;
  @ApiPropertyOptional({ description: 'Merge-field values behind the content' })
  @IsOptional()
  @IsObject()
  mergeValues?: Record<string, string>;
}
