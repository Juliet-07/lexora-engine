import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/decorators';
import { DemoRequestService } from '../services/demo-request.service';
import { AvailabilityService } from '../services/availability.service';
import { SubmitDemoRequestDto } from '../dtos/demo-request.dto';

// Backs the public website's "Contact us / book a demo" form —
// unauthenticated by design, same convention as
// NewsletterSubscriberPublicController.
@ApiTags('Public — Contact / Demo Requests')
@Public()
@Controller('public/demo-requests')
export class DemoRequestPublicController {
  constructor(
    private readonly service: DemoRequestService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  @Get('availability')
  getAvailability() {
    return this.availabilityService.getPublicWeek();
  }

  @Post()
  submit(@Body() dto: SubmitDemoRequestDto) {
    return this.service.submit(dto);
  }
}
