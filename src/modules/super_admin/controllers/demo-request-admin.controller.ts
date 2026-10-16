import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';
import { DemoRequestService } from '../services/demo-request.service';
import { AvailabilityService } from '../services/availability.service';
import {
  SetAvailabilityDto,
  ConfirmScheduleDto,
  ConfirmRescheduleDto,
  CancelDemoRequestDto,
  UpdateDemoRequestNotesDto,
} from '../dtos/demo-request.dto';

@ApiTags('SuperAdmin — Contact / Demo Requests')
@ApiBearerAuth()
@UserTypes(UserType.SUPER_ADMIN)
@Controller('super-admin/demo-requests')
export class DemoRequestAdminController {
  constructor(
    private readonly service: DemoRequestService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  @Get()
  getAll() {
    return this.service.getAll();
  }

  @Get('availability')
  getAvailability() {
    return this.availabilityService.getOrCreate();
  }

  @Post('availability')
  setAvailability(@Body() dto: SetAvailabilityDto) {
    return this.availabilityService.set(dto);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Patch(':id/notes')
  updateNotes(@Param('id') id: string, @Body() dto: UpdateDemoRequestNotesDto) {
    return this.service.updateNotes(id, dto);
  }

  @Post(':id/schedule')
  confirmSchedule(@Param('id') id: string, @Body() dto: ConfirmScheduleDto) {
    return this.service.confirmSchedule(id, dto);
  }

  @Post(':id/reschedule')
  reschedule(@Param('id') id: string, @Body() dto: ConfirmRescheduleDto) {
    return this.service.reschedule(id, dto);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelDemoRequestDto) {
    return this.service.cancel(id, dto);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.service.complete(id);
  }
}
