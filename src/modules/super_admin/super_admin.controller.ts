import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';

import { SuperAdminService } from './super_admin.service';
import {
  CreateTenantDto,
  UpdateTenantDto,
  UpdateTenantStatusDto,
  TenantFilterDto,
  CreateModuleDto,
  UpdateModuleDto,
  ToggleModuleDto,
  CreateSubscriptionPlanDto,
  UpdateSubscriptionPlanDto,
  AssignTenantSubscriptionDto,
  UpdateTenantSubscriptionStatusDto,
  AddAddonModulesDto,
} from './dto/superadmin.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserTypes, CurrentUser } from '../../common/decorators/index';
import {
  UserType,
  SubscriptionStatus,
} from '../../common/interfaces/user-role.enum';
import { PaginationDto } from '../../common/pagination.dto';

@ApiTags('SuperAdmin')
@ApiBearerAuth('bearerAuth')
// @UseGuards(JwtAuthGuard, RolesGuard)
@UserTypes(UserType.SUPER_ADMIN) // ALL routes in this controller: super admin only
@Controller('super-admin')
export class SuperAdminController {
  constructor(private readonly service: SuperAdminService) {}

  // ═══════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════

  @Get('dashboard')
  @ApiOperation({ summary: 'Platform overview dashboard' })
  getDashboard() {
    return this.service.getDashboard();
  }

  // ═══════════════════════════════════════════════════════════
  // TENANT MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  @Post('tenants')
  @ApiOperation({
    summary: 'Create a new tenant',
    description:
      'Creates the tenant account, assigns a subscription, and emails ' +
      'login credentials (email + temp password) to the tenant.',
  })
  createTenant(
    @Body() dto: CreateTenantDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.service.createTenant(dto, adminId);
  }

  @Get('tenants')
  @ApiOperation({ summary: 'List all tenants with filters and pagination' })
  getTenants(
    @Query() pagination: PaginationDto,
    @Query() filters: TenantFilterDto,
  ) {
    return this.service.getTenants(pagination, filters);
  }

  @Get('tenants/:id')
  @ApiOperation({ summary: 'Get full tenant details including subscription' })
  getTenant(@Param('id') id: string) {
    return this.service.getTenantById(id);
  }

  @Get('tenants/:id/stats')
  @ApiOperation({
    summary: 'Get tenant statistics (client count, subscription)',
  })
  getTenantStats(@Param('id') id: string) {
    return this.service.getTenantStats(id);
  }

  @Patch('tenants/:id')
  @ApiOperation({ summary: 'Update tenant profile/contact details' })
  updateTenant(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.service.updateTenant(id, dto);
  }

  @Patch('tenants/:id/status')
  @ApiOperation({ summary: 'Activate, suspend or deactivate a tenant' })
  updateTenantStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    return this.service.updateTenantStatus(id, dto);
  }

//   @Post('tenants/:id/reset-password')
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({
//     summary: 'Reset tenant password',
//     description: 'Generates a new temp password and emails it to the tenant.',
//   })
//   resetTenantPassword(@Param('id') id: string) {
//     return this.service.resetTenantPassword(id);
//   }

  @Delete('tenants/:id')
  @ApiOperation({
    summary: 'Soft-delete (deactivate) a tenant',
    description:
      'Deactivates the tenant and all their clients. Cancels subscription.',
  })
  deleteTenant(@Param('id') id: string) {
    return this.service.deleteTenant(id);
  }

  // ═══════════════════════════════════════════════════════════
  // TENANT SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════

  @Post('tenants/:id/subscription')
  @ApiOperation({ summary: 'Assign or upgrade a tenant subscription plan' })
  assignSubscription(
    @Param('id') tenantId: string,
    @Body() dto: AssignTenantSubscriptionDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.service.assignTenantSubscription(tenantId, dto, adminId);
  }

  @Get('tenants/:id/subscription')
  @ApiOperation({ summary: 'Get the current subscription for a tenant' })
  getTenantSubscription(@Param('id') tenantId: string) {
    return this.service.getTenantSubscription(tenantId);
  }

  @Patch('tenants/:id/subscription/status')
  @ApiOperation({
    summary: 'Update tenant subscription status (active/suspended/cancelled)',
  })
  updateSubscriptionStatus(
    @Param('id') tenantId: string,
    @Body() dto: UpdateTenantSubscriptionStatusDto,
  ) {
    return this.service.updateTenantSubscriptionStatus(tenantId, dto);
  }

  @Post('tenants/:id/subscription/addons')
  @ApiOperation({ summary: 'Add module add-ons to a tenant subscription' })
  addAddonModules(
    @Param('id') tenantId: string,
    @Body() dto: AddAddonModulesDto,
  ) {
    return this.service.addAddonModules(tenantId, dto);
  }

  @Delete('tenants/:id/subscription/addons')
  @ApiOperation({ summary: 'Remove module add-ons from a tenant subscription' })
  removeAddonModules(
    @Param('id') tenantId: string,
    @Body() dto: AddAddonModulesDto,
  ) {
    return this.service.removeAddonModules(tenantId, dto);
  }

  // ═══════════════════════════════════════════════════════════
  // PLATFORM MODULES
  // ═══════════════════════════════════════════════════════════

  @Post('modules')
  @ApiOperation({ summary: 'Create a new platform module' })
  createModule(@Body() dto: CreateModuleDto) {
    return this.service.createModule(dto);
  }

  @Get('modules')
  @ApiOperation({ summary: 'List all platform modules' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  getModules(@Query('includeInactive') includeInactive?: string) {
    return this.service.getModules(includeInactive === 'true');
  }

  @Get('modules/:key')
  @ApiOperation({ summary: 'Get a platform module by key' })
  getModule(@Param('key') key: string) {
    return this.service.getModuleByKey(key);
  }

  @Patch('modules/:key')
  @ApiOperation({ summary: 'Update platform module details' })
  updateModule(@Param('key') key: string, @Body() dto: UpdateModuleDto) {
    return this.service.updateModule(key, dto);
  }

  @Patch('modules/:key/toggle')
  @ApiOperation({ summary: 'Enable or disable a platform module globally' })
  toggleModule(@Param('key') key: string, @Body() dto: ToggleModuleDto) {
    return this.service.toggleModule(key, dto.isActive);
  }

  @Delete('modules/:key')
  @ApiOperation({ summary: 'Delete a platform module' })
  deleteModule(@Param('key') key: string) {
    return this.service.deleteModule(key);
  }

  // ═══════════════════════════════════════════════════════════
  // SUBSCRIPTION PLANS
  // ═══════════════════════════════════════════════════════════

  @Post('plans')
  @ApiOperation({ summary: 'Create a subscription plan configuration' })
  createPlan(@Body() dto: CreateSubscriptionPlanDto) {
    return this.service.createSubscriptionPlan(dto);
  }

  @Get('plans')
  @ApiOperation({ summary: 'List all subscription plans' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  getPlans(@Query('includeInactive') includeInactive?: string) {
    return this.service.getSubscriptionPlans(includeInactive === 'true');
  }

  @Get('plans/:plan')
  @ApiOperation({ summary: 'Get a specific plan configuration' })
  getPlan(@Param('plan') plan: string) {
    return this.service.getSubscriptionPlanByKey(plan);
  }

  @Patch('plans/:plan')
  @ApiOperation({ summary: 'Update a subscription plan configuration' })
  updatePlan(
    @Param('plan') plan: string,
    @Body() dto: UpdateSubscriptionPlanDto,
  ) {
    return this.service.updateSubscriptionPlan(plan, dto);
  }

  @Get('subscriptions')
  @ApiOperation({
    summary: 'List all tenant subscriptions across the platform',
  })
  @ApiQuery({ name: 'status', enum: SubscriptionStatus, required: false })
  getAllSubscriptions(
    @Query() pagination: PaginationDto,
    @Query('status') status?: SubscriptionStatus,
  ) {
    return this.service.getAllSubscriptions(pagination, status);
  }
}
