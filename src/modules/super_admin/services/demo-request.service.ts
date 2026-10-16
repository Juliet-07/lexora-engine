import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmailService } from 'src/common/utils/mailing/email.service';
import {
  DemoRequest,
  DemoRequestDocument,
  DemoRequestStatus,
} from '../schemas/demo-request.schema';
import {
  SubmitDemoRequestDto,
  ConfirmScheduleDto,
  ConfirmRescheduleDto,
  CancelDemoRequestDto,
  UpdateDemoRequestNotesDto,
} from '../dtos/demo-request.dto';

function dateLabel(d: Date): string {
  return new Date(d).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

@Injectable()
export class DemoRequestService {
  constructor(
    @InjectModel(DemoRequest.name)
    private readonly model: Model<DemoRequestDocument>,
    private readonly emailService: EmailService,
  ) {}

  async getAll(): Promise<DemoRequestDocument[]> {
    return this.model.find().sort({ createdAt: -1 });
  }

  async getOne(id: string): Promise<DemoRequestDocument> {
    const r = await this.model.findById(id);
    if (!r) throw new NotFoundException('Request not found');
    return r;
  }

  // Public — the website's contact/booking form. Fires the immediate
  // thank-you email; the real confirmation (with a meeting link)
  // follows once the Super Admin reviews the request.
  async submit(dto: SubmitDemoRequestDto): Promise<DemoRequestDocument> {
    const created = await this.model.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email.toLowerCase(),
      company: dto.company ?? '',
      industry: dto.industry ?? '',
      companySize: dto.companySize ?? '',
      subject: dto.subject,
      interests: dto.interests ?? [],
      goals: dto.goals ?? '',
      requestedDay: dto.requestedDay,
      requestedDate: new Date(dto.requestedDate),
      requestedTime: dto.requestedTime,
      alternateDate: new Date(dto.alternateDate),
      alternateTime: dto.alternateTime,
      status: DemoRequestStatus.SCHEDULED,
    });

    await this.emailService.sendDemoRequestThankYou({
      to: created.email,
      firstName: created.firstName,
      subject: created.subject,
      requestedDateLabel: dateLabel(created.requestedDate),
      requestedTime: created.requestedTime,
    });

    return created;
  }

  private assertNotFinalized(r: DemoRequestDocument) {
    if (
      r.status === DemoRequestStatus.CANCELLED ||
      r.status === DemoRequestStatus.COMPLETED
    ) {
      throw new ConflictException(
        `This request is already ${r.status.toLowerCase()} and can no longer be changed.`,
      );
    }
  }

  // Super Admin confirms the booking — works whether the request is
  // freshly submitted (Scheduled, unconfirmed) or coming back from
  // Rescheduled (requestedDate/Time already point at the new slot by
  // the time this runs — see reschedule() below).
  async confirmSchedule(
    id: string,
    dto: ConfirmScheduleDto,
  ): Promise<DemoRequestDocument> {
    const r = await this.getOne(id);
    this.assertNotFinalized(r);
    if (!dto.meetingLink?.trim()) {
      throw new BadRequestException(
        'A meeting link is required to confirm this booking.',
      );
    }

    r.status = DemoRequestStatus.SCHEDULED;
    r.meetingLink = dto.meetingLink.trim();
    r.confirmedAt = new Date();
    await r.save();

    await this.emailService.sendDemoRequestScheduled({
      to: r.email,
      firstName: r.firstName,
      subject: r.subject,
      dateLabel: dateLabel(r.requestedDate),
      time: r.requestedTime,
      meetingLink: r.meetingLink,
    });

    return r;
  }

  // Reschedules straight to the prospect's own alternate date/time
  // (collected on the original form) — no new date has to be picked
  // by the Super Admin. requestedDate/Time become the new slot, so a
  // later confirmSchedule() against this same record just works.
  async reschedule(
    id: string,
    _dto: ConfirmRescheduleDto,
  ): Promise<DemoRequestDocument> {
    const r = await this.getOne(id);
    this.assertNotFinalized(r);
    if (!r.alternateDate || !r.alternateTime) {
      throw new BadRequestException(
        'This request has no alternate date to reschedule to.',
      );
    }

    const originalDateLabel = dateLabel(r.requestedDate);
    const originalTime = r.requestedTime;

    r.requestedDate = r.alternateDate;
    r.requestedTime = r.alternateTime;
    r.alternateDate = null;
    r.alternateTime = null;
    r.status = DemoRequestStatus.RESCHEDULED;
    r.meetingLink = '';
    r.confirmedAt = null;
    await r.save();

    await this.emailService.sendDemoRequestRescheduled({
      to: r.email,
      firstName: r.firstName,
      subject: r.subject,
      originalDateLabel,
      originalTime,
      newDateLabel: dateLabel(r.requestedDate),
      newTime: r.requestedTime,
    });

    return r;
  }

  async cancel(
    id: string,
    dto: CancelDemoRequestDto,
  ): Promise<DemoRequestDocument> {
    const r = await this.getOne(id);
    this.assertNotFinalized(r);
    if (!dto.reason?.trim()) {
      throw new BadRequestException(
        'A reason is required when cancelling a request.',
      );
    }

    r.status = DemoRequestStatus.CANCELLED;
    r.cancellationReason = dto.reason.trim();
    await r.save();

    await this.emailService.sendDemoRequestCancelled({
      to: r.email,
      firstName: r.firstName,
      subject: r.subject,
      dateLabel: dateLabel(r.requestedDate),
      time: r.requestedTime,
      reason: r.cancellationReason,
    });

    return r;
  }

  // Only a confirmed, scheduled meeting can be marked done — matches
  // the Oct 2026 request that Completed is reached only by coming
  // back to a Scheduled meeting afterwards, never set directly on a
  // fresh request.
  async complete(id: string): Promise<DemoRequestDocument> {
    const r = await this.getOne(id);
    if (r.status !== DemoRequestStatus.SCHEDULED) {
      throw new BadRequestException(
        'Only a scheduled meeting can be marked completed.',
      );
    }
    r.status = DemoRequestStatus.COMPLETED;
    await r.save();
    return r;
  }

  async updateNotes(
    id: string,
    dto: UpdateDemoRequestNotesDto,
  ): Promise<DemoRequestDocument> {
    const r = await this.getOne(id);
    r.notes = dto.notes ?? '';
    await r.save();
    return r;
  }
}
