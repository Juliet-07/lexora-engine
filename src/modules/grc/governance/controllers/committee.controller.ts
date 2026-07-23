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
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CommitteeService } from '../services';
import {
  CreateCommitteeDto,
  AddCommitteeMemberDto,
  AddCommitteeTaskDto,
  UpdateTaskStatusDto,
} from '../dtos/index.dto';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';

@ApiTags('GRC — Governance')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/governance/committees')
export class CommitteeController {
  constructor(
    private readonly committeeService: CommitteeService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  @Post()
  create(
    @Body() dto: CreateCommitteeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.committeeService.create(t || u, dto);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.committeeService.getAll(t || u);
  }

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.committeeService.getById(t || u, id);
  }

  @Post(':id/members')
  async addMember(
    @Param('id') id: string,
    @Body() dto: AddCommitteeMemberDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.committeeService.addMember(tenantId, id, dto, businessName);
  }

  @Delete(':id/members/:index')
  removeMember(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.committeeService.removeMember(t || u, id, Number(index));
  }

  @Post(':id/tasks')
  async addTask(
    @Param('id') id: string,
    @Body() dto: AddCommitteeTaskDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.committeeService.addTask(tenantId, id, dto, businessName);
  }

  @Patch(':id/tasks/:index/status')
  updateTaskStatus(
    @Param('id') id: string,
    @Param('index') index: string,
    @Body() dto: UpdateTaskStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.committeeService.updateTaskStatus(
      t || u,
      id,
      Number(index),
      dto,
    );
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.committeeService.delete(t || u, id);
    return { success: true };
  }
}
