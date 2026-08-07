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
import { KnowledgeBaseService } from './knowledge-base.service';
import {
  UpsertKnowledgeEntryDto,
  SetKnowledgeStatusDto,
} from './knowledge-entry.dto';
import { UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';

@ApiTags('Super Admin — Knowledge Base')
@ApiBearerAuth()
@UserTypes(UserType.SUPER_ADMIN)
@Controller('super-admin/knowledge')
export class KnowledgeBaseAdminController {
  constructor(private readonly service: KnowledgeBaseService) {}

  @Get()
  getAll() {
    return this.service.getAllForAdmin();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getOneForAdmin(id);
  }

  @Post()
  create(@Body() dto: UpsertKnowledgeEntryDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpsertKnowledgeEntryDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetKnowledgeStatusDto) {
    return this.service.setStatus(id, dto.status);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
