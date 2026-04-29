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
import { KycService } from './kyc.service';
import {
  SubmitKycDto,
  ReviewKycDto,
  RunScreeningDto,
  UpdateScreeningDto,
  RiskScoreDto,
} from './dto/kyc.dto';
import { KycStatus } from './schemas/kyc-record.schema';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, CurrentUser } from '../../common/decorators/index';
import { PaginationDto } from '../../common/pagination.dto';

@ApiTags('KYC / AML')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('kyc')
export class KycController {
  constructor(private readonly service: KycService) {}

  @Post('submit')
  @ApiOperation({ summary: 'Submit KYC record for a client' })
  submitKyc(
    @Body() dto: SubmitKycDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.submitKYC(dto, orgId, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all KYC records for organization' })
  @ApiQuery({ name: 'status', enum: KycStatus, required: false })
  findAll(
    @CurrentUser('organizationId') orgId: string,
    @Query() pagination: PaginationDto,
    @Query('status') status?: KycStatus,
  ) {
    return this.service.getAllKyc(orgId, pagination, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get KYC record by ID' })
  findOne(@Param('id') id: string) {
    return this.service.getKycById(id);
  }

  @Get('client/:clientId')
  @ApiOperation({ summary: 'Get all KYC records for a specific client' })
  getByClient(@Param('clientId') clientId: string) {
    return this.service.getKycByClient(clientId);
  }

  @Patch(':id/review')
  @Roles('admin', 'compliance-officer', 'manager')
  @ApiOperation({ summary: 'Review/approve/reject a KYC record [compliance]' })
  reviewKyc(
    @Param('id') id: string,
    @Body() dto: ReviewKycDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.reviewKyc(id, dto, userId);
  }

  @Post(':id/risk-score')
  @Roles('admin', 'compliance-officer')
  @ApiOperation({
    summary: 'Calculate and save risk score for KYC [compliance]',
  })
  calculateRisk(
    @Param('id') kycId: string,
    @Body() dto: RiskScoreDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.calculateRiskScore(kycId, dto, userId);
  }

  @Get('risk/:clientId')
  @ApiOperation({ summary: 'Get risk assessments for a client' })
  getRiskAssessments(@Param('clientId') clientId: string) {
    return this.service.getRiskAssessments(clientId);
  }

  @Post('screening/run')
  @Roles('admin', 'compliance-officer')
  @ApiOperation({
    summary: 'Run AML/sanctions screening for a client [compliance]',
  })
  runScreening(
    @Body() dto: RunScreeningDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.runScreening(dto, orgId);
  }

  @Get('screening/client/:clientId')
  @ApiOperation({ summary: 'Get screening results for a client' })
  getScreenings(@Param('clientId') clientId: string) {
    return this.service.getScreeningsByClient(clientId);
  }

  @Patch('screening/:id')
  @Roles('admin', 'compliance-officer')
  @ApiOperation({ summary: 'Update screening result status [compliance]' })
  updateScreening(
    @Param('id') id: string,
    @Body() dto: UpdateScreeningDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.updateScreening(id, dto, userId);
  }
}
