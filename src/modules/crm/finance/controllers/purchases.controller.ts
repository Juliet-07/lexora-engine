import { Controller, Get, Post, Patch, Body, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  VendorService,
  PurchaseOrderService,
  BillService,
  ExpenseClaimService,
  ExpensePolicyService,
} from '../services';
import {
  CreateVendorDto,
  CreatePurchaseOrderDto,
  CreateBillDto,
  CreateExpenseClaimDto,
  UpsertExpensePolicyDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Finance — Purchases')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/vendors')
export class VendorController {
  constructor(private readonly service: VendorService) {}

  @Post()
  @ApiOperation({ summary: 'Add a vendor' })
  create(
    @Body() dto: CreateVendorDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'Vendor register — outstanding and age band computed live from real bills',
  })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }
}

@ApiTags('CRM — Finance — Purchases')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/purchase-orders')
export class PurchaseOrderController {
  constructor(
    private readonly service: PurchaseOrderService,
    private readonly vendorService: VendorService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a draft purchase order' })
  async create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const vendors = await this.vendorService.getAll(t || u);
    const vendor = vendors.find((v: any) => String(v._id) === dto.vendorId);
    return this.service.create(
      t || u,
      dto,
      vendor?.name ?? '',
      vendor?.tin ?? '',
    );
  }

  @Get()
  @ApiOperation({ summary: 'All purchase orders' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One purchase order' })
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Post(':id/issue')
  @ApiOperation({ summary: 'Issue to the vendor — the real "sent" moment' })
  issue(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.issue(t || u, id);
  }

  @Post(':id/fulfill')
  @ApiOperation({ summary: 'Mark fulfilled' })
  markFulfilled(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.markFulfilled(t || u, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel' })
  cancel(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.cancel(t || u, id);
  }

  @Get(':id/pdf')
  @ApiOperation({
    summary: 'Download as PDF — the document actually issued to the vendor',
  })
  async downloadPdf(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const po: any = await this.service.getById(t || u, id);
    const buffer = await this.service.generatePdf(t || u, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${po.ref}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}

@ApiTags('CRM — Finance — Purchases')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/bills')
export class BillController {
  constructor(
    private readonly service: BillService,
    private readonly vendorService: VendorService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Capture a vendor bill' })
  async create(
    @Body() dto: CreateBillDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const vendors = await this.vendorService.getAll(t || u);
    const vendor = vendors.find((v: any) => String(v._id) === dto.vendorId);
    return this.service.create(t || u, dto, vendor?.name ?? '');
  }

  @Get()
  @ApiOperation({ summary: 'All bills' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve for payment' })
  approve(
    @Param('id') id: string,
    @Body() body: { approvedBy: string },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.approve(t || u, id, body.approvedBy);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject' })
  reject(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.reject(t || u, id);
  }

  @Post(':id/schedule-payment')
  @ApiOperation({ summary: 'Add to the next payment run' })
  schedulePayment(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.schedulePayment(t || u, id);
  }

  @Post(':id/mark-paid')
  @ApiOperation({ summary: 'Mark paid' })
  markPaid(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.markPaid(t || u, id);
  }
}

@ApiTags('CRM — Finance — Purchases')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/expense-claims')
export class ExpenseClaimController {
  constructor(private readonly service: ExpenseClaimService) {}

  @Post()
  @ApiOperation({ summary: 'Record an expense claim for an employee' })
  create(
    @Body()
    body: CreateExpenseClaimDto & {
      employeeUserId: string;
      employee: string;
      mandateName?: string;
    },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(
      t || u,
      body.employeeUserId,
      body.employee,
      body,
      body.mandateName,
    );
  }

  @Get()
  @ApiOperation({ summary: 'All expense claims' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Post(':id/approve')
  @ApiOperation({
    summary:
      'Approve for reimbursement — rechargeable claims join the WIP disbursement register',
  })
  approve(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.approve(t || u, id);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject' })
  reject(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.reject(t || u, id);
  }

  @Post(':id/mark-paid')
  @ApiOperation({ summary: 'Mark reimbursed' })
  markPaid(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.markPaid(t || u, id);
  }
}

@ApiTags('CRM — Finance — Purchases')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/expense-policies')
export class ExpensePolicyController {
  constructor(private readonly service: ExpensePolicyService) {}

  @Get()
  @ApiOperation({ summary: 'Real, tenant-configurable expense policy lines' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Patch()
  @ApiOperation({
    summary:
      'Set (create or update) a policy line, e.g. "Mileage" → "RWF 650 / km"',
  })
  upsert(
    @Body() dto: UpsertExpensePolicyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.upsert(t || u, dto);
  }
}
