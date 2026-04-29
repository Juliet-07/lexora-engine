import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { BillingService } from './billing.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  UpdateInvoiceStatusDto,
  ProcessPaymentDto,
} from './dto/billing.dto';
import { InvoiceStatus } from './schemas/billing.schema';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, CurrentUser } from '../../common/decorators/index';
import { PaginationDto } from '../../common/pagination.dto';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Post('invoices')
  @ApiOperation({ summary: 'Create a new invoice' })
  createInvoice(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.createInvoice(dto, orgId);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List all invoices' })
  @ApiQuery({ name: 'status', enum: InvoiceStatus, required: false })
  findAll(
    @CurrentUser('organizationId') orgId: string,
    @Query() pagination: PaginationDto,
    @Query('status') status?: InvoiceStatus,
  ) {
    return this.service.findAll(orgId, pagination, status);
  }

  @Get('invoices/stats')
  @ApiOperation({ summary: 'Get billing statistics for the organization' })
  getStats(@CurrentUser('organizationId') orgId: string) {
    return this.service.getBillingStats(orgId);
  }

  @Get('invoices/client/:clientId')
  @ApiOperation({ summary: 'Get invoices for a specific client' })
  findByClient(
    @Param('clientId') clientId: string,
    @CurrentUser('organizationId') orgId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.findByClient(clientId, orgId, pagination);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get invoice by ID' })
  findOne(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.findById(id, orgId);
  }

  @Patch('invoices/:id')
  @ApiOperation({ summary: 'Update invoice (draft only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.updateInvoice(id, dto, orgId);
  }

  @Patch('invoices/:id/status')
  @ApiOperation({ summary: 'Update invoice status (e.g. mark as sent)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceStatusDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.updateInvoiceStatus(id, dto, orgId);
  }

  @Post('payments')
  @ApiOperation({ summary: 'Process a payment against an invoice' })
  processPayment(
    @Body() dto: ProcessPaymentDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.processPayment(dto, orgId);
  }

  @Get('invoices/:id/transactions')
  @ApiOperation({ summary: 'Get all transactions for an invoice' })
  getTransactions(@Param('id') invoiceId: string) {
    return this.service.getTransactionsByInvoice(invoiceId);
  }

  @Patch('invoices/mark-overdue/run')
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Mark past-due invoices as overdue [admin]' })
  markOverdue() {
    return this.service.markOverdueInvoices();
  }
}
