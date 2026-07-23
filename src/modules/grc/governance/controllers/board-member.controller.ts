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
import { BoardMemberService } from '../services';
import {
  CreateBoardMemberDto,
  UpdateBoardMemberDto,
  RecordConflictDto,
  LogTrainingDto,
  SetSuccessorDto,
  AddSkillDto,
} from '../dtos/index.dto';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/modules/auth/schemas';
import { Model } from 'mongoose';

@ApiTags('GRC — Governance')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/governance/board-members')
export class BoardMemberController {
  constructor(
    private readonly boardMemberService: BoardMemberService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateBoardMemberDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const tenantId = t || u;
    const businessName = await resolveBusinessName(this.userModel, tenantId);
    return this.boardMemberService.create(tenantId, dto, businessName);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.boardMemberService.getAll(t || u);
  }

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.getById(t || u, id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBoardMemberDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.update(t || u, id, dto);
  }

  @Patch(':id/successor')
  @ApiOperation({
    summary: "Set or clear this board member's designated successor",
  })
  setSuccessor(
    @Param('id') id: string,
    @Body() dto: SetSuccessorDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.setSuccessor(t || u, id, dto.successorId);
  }

  @Post(':id/conflicts')
  @ApiOperation({ summary: 'Record a conflict-of-interest disclosure' })
  recordConflict(
    @Param('id') id: string,
    @Body() dto: RecordConflictDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.recordConflict(t || u, id, dto);
  }

  @Post(':id/training')
  @ApiOperation({ summary: 'Log a completed training or certification' })
  logTraining(
    @Param('id') id: string,
    @Body() dto: LogTrainingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.logTraining(t || u, id, dto);
  }

  @Post(':id/skills')
  addSkill(
    @Param('id') id: string,
    @Body() dto: AddSkillDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.addSkill(t || u, id, dto);
  }

  @Delete(':id/skills/:index')
  removeSkill(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.boardMemberService.removeSkill(t || u, id, Number(index));
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    await this.boardMemberService.delete(t || u, id);
    return { success: true };
  }
}
