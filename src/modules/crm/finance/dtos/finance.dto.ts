import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsMongoId,
  IsArray,
  ValidateNested,
  IsEmail,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BillingModel } from '../schemas';
import { PaymentMethod } from '../schemas';
import { QuoteKind } from '../schemas';
import { RecurringFrequency } from '../schemas';
import { BankAccountType, TxLinkType } from '../schemas';
import { TaxObligationType } from '../schemas';
import { AccountType, AssetKind, JournalType } from '../schemas';
import { FundStatus } from '../schemas';
import { WaterfallType, CommitmentType, DistributionSource } from '../schemas';
import { ValuationMethod, IfrsLevel } from '../schemas';
import { InterestTreatment } from '../schemas';
import { ClientInvoiceAction } from '../schemas';

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
  @ApiPropertyOptional() @IsOptional() @IsMongoId() mandateId?: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
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

export class CreateVendorDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() terms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() wht?: boolean;
}

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

// ── Purchases: bills ──────────────────────────────────────────

export class CreateBillDto {
  // Optional — a bill can record a general expense with no formal
  // vendor relationship. When vendorId is omitted, vendorName is
  // required as the free-text payee label instead.
  @ApiPropertyOptional() @IsOptional() @IsMongoId() vendorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vendorName?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() poId?: string;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiProperty() @IsDateString() dueOn: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() recurring?: boolean;
}

// ── Purchases: expense claims ────────────────────────────────

export class CreateExpenseClaimDto {
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() mandateId?: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() rechargeable?: boolean;
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

export class MatchTransactionDto {
  @ApiProperty({ enum: TxLinkType }) @IsEnum(TxLinkType) linkType: TxLinkType;
  @ApiProperty() @IsString() linkId: string;
  @ApiProperty() @IsString() linkLabel: string;
}

export class CreateBankRuleDto {
  @ApiProperty() @IsString() matchText: string;
  @ApiProperty() @IsString() account: string;
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
  @ApiProperty() @IsString() period: string;
  @ApiProperty() @IsDateString() dueOn: string;
  @ApiProperty() @IsNumber() amount: number;
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
}

export class CreateCapitalCallDto {
  @ApiProperty() @IsString() purpose: string;
  @ApiProperty() @IsNumber() @Min(0.01) totalAmount: number;
  @ApiProperty() @IsDateString() issuedOn: string;
  @ApiProperty() @IsDateString() dueOn: string;
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

// ── Trust accounting ──────────────────────────────────────────

export class CreateTrustLedgerDto {
  @ApiProperty() @IsMongoId() bankAccountId: string;
  @ApiProperty() @IsMongoId() clientUserId: string;
  @ApiProperty() @IsString() clientName: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() mandateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mandateName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(InterestTreatment)
  interestTreatment?: InterestTreatment;
}

export class RecordTrustDepositDto {
  @ApiProperty() @IsMongoId() ledgerId: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsString() preparedBy: string;
}

export class RequestTrustDrawdownDto {
  @ApiProperty() @IsMongoId() ledgerId: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() linkedInvoiceId?: string;
  @ApiProperty() @IsString() preparedBy: string;
}

export class AuthoriseTrustDrawdownDto {
  @ApiProperty() @IsString() authorisedBy: string;
}

export class RejectTrustDrawdownDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
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
