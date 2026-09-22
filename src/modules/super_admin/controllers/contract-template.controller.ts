import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import {
  PlatformContractTemplateService,
  PlatformTemplateFolderService,
} from '../services/contract-template.service';
import {
  CreatePlatformContractTemplateDto,
  UpdatePlatformContractTemplateDto,
  SetTemplateStatusDto,
  SetTemplateFolderDto,
  CreatePlatformTemplateFolderDto,
  UpdatePlatformTemplateFolderDto,
} from '../dtos';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';

@ApiTags('SuperAdmin')
@ApiBearerAuth()
@UserTypes(UserType.SUPER_ADMIN)
@Controller('super-admin/contract-templates')
export class PlatformContractTemplateController {
  constructor(private readonly service: PlatformContractTemplateService) {}

  @Get()
  @ApiQuery({
    name: 'folderId',
    required: false,
    description:
      "Filter by folder, or 'uncategorized' for templates with no folder",
  })
  @ApiQuery({ name: 'moduleKey', required: false })
  @ApiQuery({ name: 'areaKey', required: false })
  @ApiOperation({ summary: 'All platform contract templates' })
  getAll(
    @Query('folderId') folderId?: string,
    @Query('moduleKey') moduleKey?: string,
    @Query('areaKey') areaKey?: string,
  ) {
    return this.service.getAll(folderId, moduleKey, areaKey);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One platform contract template' })
  getOne(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an authored (rich-text) template, starting as Draft',
  })
  create(
    @Body() dto: CreatePlatformContractTemplateDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.service.create(dto, adminId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an authored template' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlatformContractTemplateDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a template — real file on disk is removed too, if any',
  })
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }

  @Patch(':id/folder')
  @ApiOperation({
    summary:
      'Move a template into a folder (or clear it back to uncategorized) — works for authored and uploaded templates alike',
  })
  setFolder(@Param('id') id: string, @Body() dto: SetTemplateFolderDto) {
    return this.service.setFolder(id, dto.folderId ?? null);
  }

  @Post(':id/status')
  @ApiOperation({
    summary:
      'Publish or unpublish — published templates become available to every tenant',
  })
  setStatus(@Param('id') id: string, @Body() dto: SetTemplateStatusDto) {
    return this.service.setStatus(id, dto.status);
  }
}

@ApiTags('SuperAdmin')
@ApiBearerAuth()
@UserTypes(UserType.SUPER_ADMIN)
@Controller('super-admin/contract-template-folders')
export class PlatformTemplateFolderController {
  constructor(private readonly service: PlatformTemplateFolderService) {}

  @Get()
  @ApiOperation({
    summary: 'All folders, each with a real, live count of templates in it',
  })
  getAll() {
    return this.service.getAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create a folder' })
  create(
    @Body() dto: CreatePlatformTemplateFolderDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.service.create(dto, adminId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a folder / edit its description' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlatformTemplateFolderDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Delete a folder — refuses if it still has templates in it, so nothing gets silently orphaned',
  })
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
