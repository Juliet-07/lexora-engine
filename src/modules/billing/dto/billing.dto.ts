import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsArray, IsNumber, IsDateString, Min,
} from 'class-validator';
import { InvoiceStatus, PaymentMethod } from '../schemas/billing.schema';

export class LineItemDto {
  @ApiProperty({ example: 'Consulting Services' })
  @IsString()
  description: string;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty({ example: 200 })
  @IsNumber()
  @Min(0)
  unitPrice: number;
}

export class CreateInvoiceDto {
  @ApiProperty({ example: 'client-id-here' })
  @IsString()
  clientId: string;

  @ApiPropertyOptional({ example: 'project-id-here' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiProperty({ type: [LineItemDto] })
  @IsArray()
  lineItems: LineItemDto[];

  @ApiPropertyOptional({ example: 16, description: 'Tax rate as percentage' })
  @IsOptional()
  @IsNumber()
  taxRate?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: '2025-12-31' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateInvoiceDto extends PartialType(CreateInvoiceDto) {}

export class UpdateInvoiceStatusDto {
  @ApiProperty({ enum: InvoiceStatus })
  @IsEnum(InvoiceStatus)
  status: InvoiceStatus;
}

export class ProcessPaymentDto {
  @ApiProperty({ example: 'invoice-id-here' })
  @IsString()
  invoiceId: string;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.BANK_TRANSFER })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ example: 'TXN-REF-12345' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
