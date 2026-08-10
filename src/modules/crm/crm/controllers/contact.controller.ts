import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ContactService } from '../services';
import { UpsertContactDto, BulkTagDto, LogActivityDto } from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Contacts (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('crm/contacts')
export class ContactController {
  constructor(private readonly service: ContactService) {}

  @Post()
  @ApiOperation({ summary: 'Create a contact' })
  create(
    @Body() dto: UpsertContactDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all contacts' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Post('bulk-tag')
  @ApiOperation({ summary: 'Apply one tag to several contacts at once' })
  bulkTag(
    @Body() dto: BulkTagDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.bulkTag(t || u, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one contact' })
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a contact' })
  update(
    @Param('id') id: string,
    @Body() dto: UpsertContactDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.update(t || u, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a contact' })
  async delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.service.delete(t || u, id);
    return { success: true };
  }

  @Post(':id/merge')
  @ApiOperation({ summary: 'Merge a flagged duplicate into its original' })
  merge(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.merge(t || u, id);
  }

  @Patch(':id/dismiss-duplicate')
  @ApiOperation({ summary: 'Dismiss a duplicate flag as a false positive' })
  dismissDuplicate(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.dismissDuplicate(t || u, id);
  }

  @Post(':id/activity')
  @ApiOperation({ summary: 'Log a manual activity entry against a contact' })
  logActivity(
    @Param('id') id: string,
    @Body() dto: LogActivityDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.logActivity(t || u, id, dto);
  }
}
