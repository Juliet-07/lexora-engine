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
import { ClauseService } from '../services';
import { CreateClauseDto, UpdateClauseDto } from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

@ApiTags('Deals & Transactions')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.DEALS)
@Controller('deals/clauses')
export class ClauseController {
  constructor(private readonly service: ClauseService) {}

  @Post()
  create(
    @Body() dto: CreateClauseDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClauseDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.update(t || u, id, dto);
  }

  @Patch(':id/toggle-approved')
  toggleApproved(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.toggleApproved(t || u, id);
  }

  @Post(':id/new-version')
  newVersion(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.newVersion(t || u, id);
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.service.delete(t || u, id);
    return { success: true };
  }
}
