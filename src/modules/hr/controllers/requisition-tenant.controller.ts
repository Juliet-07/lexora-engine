import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { RequisitionService, RequisitionTypeService } from '../services';
import { ReviewRequisitionDto, UpdateRequisitionTypesDto } from '../dtos';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';

@ApiTags('HR — Requisition Types (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/requisitions/types')
export class RequisitionTypeController {
  constructor(private readonly typeService: RequisitionTypeService) {}

  @Get()
  @ApiOperation({ summary: "Get this tenant's requisition type list" })
  get(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.typeService.getOrCreate(t || u);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update the requisition type list' })
  update(
    @Body() dto: UpdateRequisitionTypesDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.typeService.update(t || u, dto);
  }
}

@ApiTags('HR — Requisitions (Tenant)')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT)
@Controller('hr/requisitions')
export class RequisitionController {
  constructor(private readonly requisitionService: RequisitionService) {}

  @Get()
  @ApiQuery({ name: 'status', required: false })
  @ApiOperation({ summary: 'List all requisitions for this tenant' })
  getAll(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Query('status') status?: string,
  ) {
    return this.requisitionService.getAll(t || u, status);
  }

  @Get(':requisitionId')
  @ApiOperation({ summary: 'Get a single requisition' })
  getOne(
    @Param('requisitionId') requisitionId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.requisitionService.getById(t || u, requisitionId);
  }

  @Patch(':requisitionId/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject a requisition' })
  review(
    @Param('requisitionId') requisitionId: string,
    @Body() dto: ReviewRequisitionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.requisitionService.review(t || u, requisitionId, u, dto);
  }

  @Post(':requisitionId/fulfill')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark an approved requisition as fulfilled' })
  fulfill(
    @Param('requisitionId') requisitionId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.requisitionService.markFulfilled(t || u, requisitionId);
  }
}
