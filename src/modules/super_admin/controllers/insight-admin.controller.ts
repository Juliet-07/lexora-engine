import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InsightService } from '../services';
import { UpsertInsightDto, SetInsightStatusDto } from '../dtos';
import { UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';

@ApiTags('SuperAdmin — Insights')
@ApiBearerAuth()
@UserTypes(UserType.SUPER_ADMIN)
@Controller('super-admin/insights')
export class InsightAdminController {
  constructor(private readonly service: InsightService) {}

  @Get()
  getAll() {
    return this.service.getAllForAdmin();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getOneForAdmin(id);
  }

  @Post()
  create(@Body() dto: UpsertInsightDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpsertInsightDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetInsightStatusDto) {
    return this.service.setStatus(id, dto.status);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
