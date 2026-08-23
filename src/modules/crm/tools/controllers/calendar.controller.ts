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
import { CalendarEventService, CalendarAggregationService } from '../services';
import { CreateCalendarEventDto, UpdateCalendarEventDto } from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

@ApiTags('CRM — Tools — Calendar')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('tools/calendar')
export class CalendarController {
  constructor(
    private readonly eventService: CalendarEventService,
    private readonly aggregationService: CalendarAggregationService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'The full unified calendar — real manual events plus real, live-computed Contract/Compliance/ADR events, never separately stored',
  })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.aggregationService.getAll(t || u);
  }

  @Post()
  @ApiOperation({ summary: 'Create a real manual event' })
  create(
    @Body() dto: CreateCalendarEventDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.eventService.create(t || u, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a manual event' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.eventService.update(t || u, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a manual event' })
  delete(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.eventService.delete(t || u, id);
  }
}
