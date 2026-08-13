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
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BillingModel } from '../schemas';
import { PaymentMethod } from '../schemas';
import { QuoteKind } from '../schemas';
import { RecurringFrequency } from '../schemas';

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
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsMongoId({ each: true })
  timeEntryIds: string[];
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
  @ApiProperty() @IsMongoId() clientUserId: string;
  @ApiProperty() @IsString() clientName: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() mandateId?: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiProperty() @IsDateString() expires: string;
  @ApiProperty({ enum: QuoteKind }) @IsEnum(QuoteKind) kind: QuoteKind;
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
