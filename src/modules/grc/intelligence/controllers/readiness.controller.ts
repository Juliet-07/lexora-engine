import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReadinessService } from '../services';
import {
  CreateAssessmentDto,
  UpdateThresholdDto,
  SetOverrideDto,
  ClearOverrideDto,
  AddGapDto,
  SetGapStatusDto,
  SetReportSectionDto,
  UpdateNotesDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/modules/auth/schemas';
import { Model } from 'mongoose';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';
import type { Response } from 'express';

@ApiTags('Deal Intelligence')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@Controller('deal-intel/readiness')
export class ReadinessController {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly service: ReadinessService,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateAssessmentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.service.create(tenantId, businessName, dto);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Patch(':id/threshold')
  updateThreshold(
    @Param('id') id: string,
    @Body() dto: UpdateThresholdDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateThreshold(t || u, id, dto);
  }

  @Patch(':id/override')
  setOverride(
    @Param('id') id: string,
    @Body() dto: SetOverrideDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setOverride(t || u, id, dto);
  }

  @Post(':id/override/clear')
  clearOverride(
    @Param('id') id: string,
    @Body() dto: ClearOverrideDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.clearOverride(t || u, id, dto);
  }

  @Post(':id/recompute')
  recompute(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recomputeAutoScores(t || u, id);
  }

  @Post(':id/gaps')
  addGap(
    @Param('id') id: string,
    @Body() dto: AddGapDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addGap(t || u, id, dto);
  }

  @Patch(':id/gaps/:gapId/status')
  setGapStatus(
    @Param('id') id: string,
    @Param('gapId') gapId: string,
    @Body() dto: SetGapStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setGapStatus(t || u, id, gapId, dto);
  }

  @Delete(':id/gaps/:gapId')
  deleteGap(
    @Param('id') id: string,
    @Param('gapId') gapId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.deleteGap(t || u, id, gapId);
  }

  @Patch(':id/report-sections')
  setReportSection(
    @Param('id') id: string,
    @Body() dto: SetReportSectionDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setReportSection(t || u, id, dto);
  }

  @Patch(':id/notes')
  updateNotes(
    @Param('id') id: string,
    @Body() dto: UpdateNotesDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateNotes(t || u, id, dto);
  }

  @Get(':id/report')
  async downloadReport(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    const buffer = await this.service.getReportPdf(tenantId, id, businessName);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        'attachment; filename="Investor Readiness Report.pdf"',
    });
    res.send(buffer);
  }
}
