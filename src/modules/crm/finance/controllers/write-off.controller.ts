import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { WriteOffService } from '../services';
import { WriteOffStage } from '../schemas';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

// Read-only — every WriteOff record is created as a side effect of a
// real action elsewhere (a WIP write-down, a credit note, or an
// invoice write-off), never directly here. This is the one real
// audit trail across all three checkpoints of the lifecycle.
@ApiTags('CRM — Finance — Write-offs')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('finance/write-offs')
export class WriteOffController {
  constructor(private readonly service: WriteOffService) {}

  @Get()
  @ApiQuery({ name: 'stage', required: false, enum: WriteOffStage })
  @ApiOperation({
    summary:
      'The full write-off audit trail — WIP write-downs, credit notes, bad debt',
  })
  getAll(
    @Query('stage') stage: WriteOffStage | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getAll(t || u, stage);
  }
}
