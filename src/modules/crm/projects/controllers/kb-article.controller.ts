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
import { KbArticleService } from '../services';
import {
  CreateKbArticleDto,
  UpdateKbArticleDto,
  VoteKbArticleDto,
} from '../dtos';
import { KbAudience, KbStatus } from '../schemas';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Projects — Knowledge Base (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('crm/kb-articles')
export class KbArticleController {
  constructor(private readonly service: KbArticleService) {}

  @Post()
  @ApiOperation({ summary: 'Create an article' })
  create(
    @Body() dto: CreateKbArticleDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  @ApiQuery({ name: 'audience', required: false, enum: KbAudience })
  @ApiQuery({ name: 'status', required: false, enum: KbStatus })
  @ApiQuery({ name: 'category', required: false })
  @ApiOperation({ summary: 'All articles, optionally filtered' })
  getAll(
    @Query('audience') audience: KbAudience | undefined,
    @Query('status') status: KbStatus | undefined,
    @Query('category') category: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAll(t || u, { audience, status, category });
  }

  @Get(':id')
  @ApiOperation({ summary: 'One article' })
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getById(t || u, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an article' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateKbArticleDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.update(t || u, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an article' })
  delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.delete(t || u, id);
  }

  @Post(':id/view')
  @ApiOperation({ summary: 'Record a view' })
  recordView(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.recordView(t || u, id);
  }

  @Post(':id/vote')
  @ApiOperation({ summary: 'Vote helpful / not helpful' })
  vote(
    @Param('id') id: string,
    @Body() dto: VoteKbArticleDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.vote(t || u, id, dto);
  }
}
