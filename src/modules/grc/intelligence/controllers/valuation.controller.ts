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
import { ValuationService } from '../services';
import {
  UpdateDcfDto,
  AddCompRowDto,
  AddPrecedentRowDto,
  UpdatePrivateDiscountDto,
  UpdateNavDto,
  UpdateDdmDto,
  UpdateBlendEntryDto,
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
@Controller('deal-intel/valuations')
export class ValuationController {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly service: ValuationService,
  ) {}

  @Post()
  create(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.create(t || u);
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

  @Patch(':id/dcf')
  updateDcf(
    @Param('id') id: string,
    @Body() dto: UpdateDcfDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateDcf(t || u, id, dto);
  }

  @Post(':id/comps')
  addComp(
    @Param('id') id: string,
    @Body() dto: AddCompRowDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addComp(t || u, id, dto);
  }

  @Delete(':id/comps/:index')
  removeComp(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.removeComp(t || u, id, Number(index));
  }

  @Patch(':id/private-discount')
  updatePrivateDiscount(
    @Param('id') id: string,
    @Body() dto: UpdatePrivateDiscountDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updatePrivateDiscount(t || u, id, dto);
  }

  @Post(':id/precedents')
  addPrecedent(
    @Param('id') id: string,
    @Body() dto: AddPrecedentRowDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addPrecedent(t || u, id, dto);
  }

  @Delete(':id/precedents/:index')
  removePrecedent(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.removePrecedent(t || u, id, Number(index));
  }

  @Patch(':id/nav')
  updateNav(
    @Param('id') id: string,
    @Body() dto: UpdateNavDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateNav(t || u, id, dto);
  }

  @Patch(':id/ddm')
  updateDdm(
    @Param('id') id: string,
    @Body() dto: UpdateDdmDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateDdm(t || u, id, dto);
  }

  @Patch(':id/blend/:method')
  updateBlendEntry(
    @Param('id') id: string,
    @Param('method') method: string,
    @Body() dto: UpdateBlendEntryDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateBlendEntry(t || u, id, method as any, dto);
  }

  @Post(':id/snapshot')
  snapshotVersion(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.snapshotVersion(t || u, id);
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
      'Content-Disposition': 'attachment; filename="Valuation Report.pdf"',
    });
    res.send(buffer);
  }
}
