import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Background Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super-admin')
@Controller('jobs')
export class JobsController {
  constructor(private readonly service: JobsService) {}

  @Post('trigger/mark-overdue')
  @ApiOperation({ summary: 'Manually trigger mark-overdue-invoices job [super-admin]' })
  triggerMarkOverdue() {
    return this.service.triggerMarkOverdue();
  }

  @Post('trigger/expire-kyc')
  @ApiOperation({ summary: 'Manually trigger expire-kyc-records job [super-admin]' })
  triggerExpireKyc() {
    return this.service.triggerExpireKyc();
  }
}
