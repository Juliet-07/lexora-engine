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
import { PolicyTemplateService } from '../services';
import { UpsertPolicyTemplateDto, SetPolicyTemplateStatusDto } from '../dtos';
import { UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';
import { POLICY_MERGE_FIELDS } from 'src/common/utils/policy-merge-fields';

@ApiTags('SuperAdmin — GRC Policy Templates')
@ApiBearerAuth()
@UserTypes(UserType.SUPER_ADMIN)
@Controller('super-admin/policy-templates')
export class PolicyTemplateAdminController {
  constructor(private readonly service: PolicyTemplateService) {}

  @Get()
  getAll() {
    return this.service.getAllForAdmin();
  }

  // The fields an author can insert into a policy / governance-code template.
  // Declared before ':id' so "merge-fields" isn't read as an id.
  @Get('merge-fields')
  getMergeFields() {
    return POLICY_MERGE_FIELDS;
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getOneForAdmin(id);
  }

  @Post()
  create(@Body() dto: UpsertPolicyTemplateDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpsertPolicyTemplateDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetPolicyTemplateStatusDto) {
    return this.service.setStatus(id, dto.status);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
