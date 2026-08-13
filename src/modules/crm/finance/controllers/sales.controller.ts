import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Patch,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import {
  CreditNoteService,
  WipService,
  QuoteService,
  RecurringInvoiceService,
} from '../services';
import {
  WriteDownWipDto,
  WriteOffWipDto,
  HoldWipDto,
} from 'src/modules/crm/projects/dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import {
  CreateCreditNoteDto,
  CreateQuoteDto,
  CreateRecurringInvoiceDto,
} from '../dtos';
import { QuoteStatus, RecurringStatus } from '../schemas';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Finance — Sales')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/wip')
export class WipController {
  constructor(private readonly service: WipService) {}

  @Get()
  @ApiQuery({ name: 'mandateId', required: false })
  @ApiOperation({
    summary:
      'The real WIP register — Approved, billable, not-yet-invoiced time',
  })
  getRegister(
    @Query('mandateId') mandateId: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getRegister(t || u, mandateId);
  }

  @Post(':id/approve-for-billing')
  @ApiOperation({
    summary: 'Billing partner approves this entry for invoicing',
  })
  approveForBilling(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.approveForBilling(t || u, id);
  }

  @Post(':id/write-down')
  @ApiOperation({ summary: 'Reduce the billable value before invoicing' })
  writeDown(
    @Param('id') id: string,
    @Body() dto: WriteDownWipDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.writeDown(
      t || u,
      id,
      dto.writtenDownAmount,
      dto.reason,
      dto.approvedBy,
    );
  }

  @Post(':id/write-off')
  @ApiOperation({ summary: 'Mark this WIP as unrecoverable, not billable' })
  writeOff(
    @Param('id') id: string,
    @Body() dto: WriteOffWipDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.writeOff(t || u, id, dto.reason, dto.approvedBy);
  }

  @Post(':id/hold')
  @ApiOperation({ summary: 'Pause billing on this entry' })
  hold(
    @Param('id') id: string,
    @Body() dto: HoldWipDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.hold(t || u, id, dto.reason);
  }
}

@ApiTags('CRM — Finance — Sales')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/credit-notes')
export class CreditNoteController {
  constructor(private readonly service: CreditNoteService) {}

  @Post()
  @ApiOperation({ summary: 'Issue a credit note against an invoice' })
  create(
    @Body() dto: CreateCreditNoteDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'All credit notes' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }
}

@ApiTags('CRM — Finance — Sales')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/quotes')
export class QuoteController {
  constructor(private readonly service: QuoteService) {}

  @Post()
  @ApiOperation({ summary: 'Create a quote or proforma' })
  create(
    @Body() dto: CreateQuoteDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'All quotes and proformas' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Move status (Sent / Declined / Expired, etc.)' })
  setStatus(
    @Param('id') id: string,
    @Body() body: { status: QuoteStatus },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStatus(t || u, id, body.status);
  }

  @Post(':id/convert')
  @ApiOperation({ summary: 'Convert to a real draft invoice' })
  convertToInvoice(
    @Param('id') id: string,
    @Body() body: { dueOn: string },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.convertToInvoice(t || u, id, body.dueOn);
  }
}

@ApiTags('CRM — Finance — Sales')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/recurring-invoices')
export class RecurringInvoiceController {
  constructor(private readonly service: RecurringInvoiceService) {}

  @Post()
  @ApiOperation({ summary: 'Create a recurring invoice schedule' })
  create(
    @Body() dto: CreateRecurringInvoiceDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'All recurring invoice schedules' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Pause or resume' })
  setStatus(
    @Param('id') id: string,
    @Body() body: { status: RecurringStatus },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStatus(t || u, id, body.status);
  }

  @Post(':id/generate')
  @ApiOperation({ summary: 'Manually generate the next invoice now' })
  generateNow(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.generateNow(t || u, id);
  }
}
