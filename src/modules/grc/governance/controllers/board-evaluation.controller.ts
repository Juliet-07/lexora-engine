import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BoardEvaluationService } from '../services';
import { CreateEvaluationCycleDto } from '../dtos/index.dto';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

// Tenant side of Board Evaluations — launching a cycle and watching
// completion/results. The PO's ask (Oct 2026) is entirely about the
// board-portal side (self/peer/chair/committee eval), but someone on
// the tenant has to start a round before there's anything for
// directors to submit against, and see how it went once it closes.
@ApiTags('GRC — Governance')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/governance/evaluations')
export class BoardEvaluationController {
  constructor(private readonly service: BoardEvaluationService) {}

  @Post()
  create(
    @Body() dto: CreateEvaluationCycleDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.createCycle(t || u, dto);
  }

  @Get()
  list(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.listCycles(t || u);
  }

  @Get(':id/results')
  results(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getCycleResults(t || u, id);
  }

  @Post(':id/close')
  close(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.closeCycle(t || u, id);
  }
}
