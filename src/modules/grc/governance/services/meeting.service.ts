import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ACK_TOKEN_EXPIRY_DAYS,
  GovernanceMeeting,
  GovernanceMeetingDocument,
  MeetingMode,
  MeetingStatus,
} from '../schemas';
import {
  CreateMeetingDto,
  AddAttendeeDto,
  AddAgendaItemDto,
  UpdateNotesDto,
  UpdateMinutesDto,
  RecordAttendanceDto,
  SubmitAckDto,
  SubmitMinutesReviewDto,
} from '../dtos/index.dto';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { join } from 'path';
import { BoardMemberService } from './board-member.service';
import { CommitteeService } from './committee.service';
import { randomBytes } from 'crypto';
import { renderRichText } from 'src/common/utils/pdf/render-rich-text.util';
import * as PDFKitImport from 'pdfkit';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const PDFDocument = ((PDFKitImport as any).default ??
  PDFKitImport) as typeof import('pdfkit');

@Injectable()
export class MeetingService {
  constructor(
    @InjectModel(GovernanceMeeting.name)
    private readonly meetingModel: Model<GovernanceMeetingDocument>,
    private readonly emailService: EmailService,
    private readonly boardMemberService: BoardMemberService,
    private readonly committeeService: CommitteeService,
  ) {}

  async create(tenantId: string, dto: CreateMeetingDto) {
    if (dto.type === 'Committee' && !dto.committeeId) {
      throw new BadRequestException(
        'A committee must be selected for a committee meeting.',
      );
    }
    if (dto.mode === MeetingMode.PHYSICAL && !dto.venue) {
      throw new BadRequestException(
        'A venue is required for a physical meeting.',
      );
    }
    if (
      dto.mode === MeetingMode.ONLINE &&
      (!dto.meetingLink || !dto.platform)
    ) {
      throw new BadRequestException(
        'A platform and meeting link are required for an online meeting.',
      );
    }

    return this.meetingModel.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      type: dto.type,
      date: new Date(dto.date),
      mode: dto.mode,
      venue: dto.venue ?? null,
      meetingLink: dto.meetingLink ?? null,
      platform: dto.platform ?? null,
      location: this.computeLocation(dto),
      chair: dto.chair,
      committeeId: dto.committeeId ? new Types.ObjectId(dto.committeeId) : null,
      notes: dto.notes ?? '',
      status: MeetingStatus.DRAFT,
      attendees: [],
      agenda: [],
      boardPack: [],
    });
  }

  async getAll(tenantId: string) {
    return this.meetingModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ date: -1 })
      .lean();
  }

  async getById(
    tenantId: string,
    id: string,
  ): Promise<GovernanceMeetingDocument> {
    const meeting = await this.meetingModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  async addAttendee(tenantId: string, id: string, dto: AddAttendeeDto) {
    const meeting = await this.getById(tenantId, id);
    meeting.attendees.push({
      name: dto.name,
      email: dto.email,
      role: dto.role ?? '',
    } as any);
    meeting.markModified('attendees');
    await meeting.save();
    return meeting;
  }

  async removeAttendee(tenantId: string, id: string, index: number) {
    const meeting = await this.getById(tenantId, id);
    meeting.attendees.splice(index, 1);
    meeting.markModified('attendees');
    await meeting.save();
    return meeting;
  }

  async addAgendaItem(tenantId: string, id: string, dto: AddAgendaItemDto) {
    const meeting = await this.getById(tenantId, id);
    meeting.agenda.push({
      title: dto.title,
      presenter: dto.presenter ?? '',
      durationMinutes: dto.durationMinutes ?? 10,
    } as any);
    meeting.markModified('agenda');
    await meeting.save();
    return meeting;
  }

  async removeAgendaItem(tenantId: string, id: string, index: number) {
    const meeting = await this.getById(tenantId, id);
    meeting.agenda.splice(index, 1);
    meeting.markModified('agenda');
    await meeting.save();
    return meeting;
  }

  async addBoardPackDoc(
    tenantId: string,
    id: string,
    file: Express.Multer.File,
  ) {
    const meeting = await this.getById(tenantId, id);
    meeting.boardPack.push({
      name: file.originalname,
      fileUrl: `/uploads/grc/meetings/board-pack/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    } as any);
    meeting.markModified('boardPack');
    await meeting.save();
    return meeting;
  }

  async removeBoardPackDoc(tenantId: string, id: string, index: number) {
    const meeting = await this.getById(tenantId, id);
    meeting.boardPack.splice(index, 1);
    meeting.markModified('boardPack');
    await meeting.save();
    return meeting;
  }

  async updateNotes(tenantId: string, id: string, dto: UpdateNotesDto) {
    const meeting = await this.getById(tenantId, id);
    meeting.notes = dto.notes;
    await meeting.save();
    return meeting;
  }

  async updateMinutes(tenantId: string, id: string, dto: UpdateMinutesDto) {
    const meeting = await this.getById(tenantId, id);
    meeting.minutes = dto.minutes;
    await meeting.save();
    return meeting;
  }

  async markHeld(tenantId: string, id: string) {
    const meeting = await this.getById(tenantId, id);
    meeting.status = MeetingStatus.HELD;
    await meeting.save();
    return meeting;
  }

  async dispatch(tenantId: string, id: string, businessName: string) {
    const meeting = await this.getById(tenantId, id);
    if (meeting.attendees.length === 0) {
      throw new BadRequestException('Add attendees before dispatching.');
    }

    const attachments = meeting.boardPack
      .filter((d) => d.fileUrl)
      .map((d) => ({
        filename: d.name,
        path: join(process.cwd(), d.fileUrl as string),
      }));

    const recipients: { name: string; email: string }[] = meeting.attendees.map(
      (a) => ({ name: a.name, email: a.email }),
    );
    const chairEmail = await this.resolveChairEmail(tenantId, meeting);
    if (
      chairEmail &&
      !recipients.some(
        (r) => r.email.toLowerCase() === chairEmail.toLowerCase(),
      )
    ) {
      recipients.push({ name: meeting.chair, email: chairEmail });
    }

    // A real, unguessable token per recipient — persisted BEFORE any
    // email goes out, so tokens exist even if a send fails partway
    // through. Reused rather than regenerated if dispatch is somehow
    // triggered twice for the same email.
    const ackLinkByEmail = new Map<string, string>();
    for (const r of recipients) {
      const token = this.ensureAckToken(meeting, r.email, r.name);
      ackLinkByEmail.set(
        r.email.toLowerCase(),
        `${process.env.TENANT_APP_URL}/meeting-ack/${token}`,
      );
    }
    await meeting.save();

    await Promise.all(
      recipients.map((r) =>
        this.emailService
          .sendMeetingDispatch(
            {
              to: r.email,
              attendeeName: r.name,
              meetingTitle: meeting.title,
              date: meeting.date,
              location: meeting.location,
              chair: meeting.chair,
              notes: meeting.notes,
              agenda: meeting.agenda.map((ag) => ({
                title: ag.title,
                presenter: ag.presenter,
                durationMinutes: ag.durationMinutes,
              })),
              boardPackNames: meeting.boardPack.map((d) => d.name),
              ackLink: ackLinkByEmail.get(r.email.toLowerCase())!,
              businessName,
            },
            attachments,
          )
          .catch(() => {}),
      ),
    );

    meeting.status = MeetingStatus.SENT;
    meeting.sentAt = new Date();
    await meeting.save();
    return meeting;
  }

  async sendMinutes(tenantId: string, id: string, businessName: string) {
    const meeting = await this.getById(tenantId, id);
    if (meeting.status !== MeetingStatus.HELD) {
      throw new BadRequestException(
        'Mark the meeting as held before sending minutes.',
      );
    }
    if (!meeting.minutes?.trim()) {
      throw new BadRequestException('Write the minutes before sending them.');
    }

    const pdfBuffer = await this.generateMinutesPdf(meeting, businessName);

    const dir = join(process.cwd(), 'uploads', 'grc', 'meetings', 'minutes');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const filename = `${meeting._id}-${Date.now()}.pdf`;
    writeFileSync(join(dir, filename), pdfBuffer);
    meeting.minutesPdfUrl = `/uploads/grc/meetings/minutes/${filename}`;

    const attachments = [
      { filename: `${meeting.title} — Minutes.pdf`, content: pdfBuffer },
    ];

    const recipients: { name: string; email: string }[] = meeting.attendees.map(
      (a) => ({ name: a.name, email: a.email }),
    );
    const chairEmail = await this.resolveChairEmail(tenantId, meeting);
    if (
      chairEmail &&
      !recipients.some(
        (r) => r.email.toLowerCase() === chairEmail.toLowerCase(),
      )
    ) {
      recipients.push({ name: meeting.chair, email: chairEmail });
    }

    const reviewLinkByEmail = new Map<string, string>();
    for (const r of recipients) {
      const token = this.ensureMinutesReviewToken(meeting, r.email, r.name);
      reviewLinkByEmail.set(
        r.email.toLowerCase(),
        `${process.env.TENANT_APP_URL}/minutes-review/${token}`,
      );
    }
    await meeting.save();

    await Promise.all(
      recipients.map((r) =>
        this.emailService
          .sendMeetingMinutes(
            {
              to: r.email,
              attendeeName: r.name,
              meetingTitle: meeting.title,
              reviewLink: reviewLinkByEmail.get(r.email.toLowerCase())!,
              businessName,
            },
            attachments,
          )
          .catch(() => {}),
      ),
    );

    meeting.minutesSentAt = new Date();
    await meeting.save();
    return meeting;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.meetingModel.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Meeting not found');
  }

  async recordAttendance(
    tenantId: string,
    id: string,
    dto: RecordAttendanceDto,
  ) {
    const meeting = await this.getById(tenantId, id);
    const indices = dto.allAttended
      ? meeting.attendees.map((_, i) => i)
      : (dto.presentIndices ?? []);
    meeting.attendanceAllPresent = dto.allAttended;
    meeting.attendancePresentIndices = indices;
    meeting.attendanceAbsenceNotes = dto.allAttended
      ? []
      : (dto.absenceNotes ?? []);
    meeting.attendanceRecordedAt = new Date();
    meeting.markModified('attendanceAbsenceNotes');
    await meeting.save();
    return meeting;
  }

  async postponeMeeting(
    tenantId: string,
    id: string,
    reason: string,
    businessName: string,
  ) {
    const meeting = await this.getById(tenantId, id);
    if (meeting.status === MeetingStatus.HELD) {
      throw new BadRequestException(
        'A meeting that has already been held cannot be postponed.',
      );
    }
    if (!reason?.trim()) {
      throw new BadRequestException(
        'A reason is required to postpone a meeting.',
      );
    }

    const originalDate = meeting.date;
    meeting.status = MeetingStatus.POSTPONED;
    meeting.postponementReason = reason.trim();
    meeting.postponedAt = new Date();
    await meeting.save();

    // Same recipient set as dispatch/sendMinutes — every attendee,
    // plus the chair if resolvable and not already one of them.
    const recipients: { name: string; email: string }[] = meeting.attendees.map(
      (a) => ({ name: a.name, email: a.email }),
    );
    const chairEmail = await this.resolveChairEmail(tenantId, meeting);
    if (
      chairEmail &&
      !recipients.some(
        (r) => r.email.toLowerCase() === chairEmail.toLowerCase(),
      )
    ) {
      recipients.push({ name: meeting.chair, email: chairEmail });
    }

    await Promise.all(
      recipients.map((r) =>
        this.emailService
          .sendMeetingPostponed({
            to: r.email,
            attendeeName: r.name,
            meetingTitle: meeting.title,
            originalDate,
            reason: meeting.postponementReason!,
            businessName,
          })
          .catch(() => {}),
      ),
    );

    return meeting;
  }

  async resumeMeeting(tenantId: string, id: string) {
    const meeting = await this.getById(tenantId, id);
    if (meeting.status !== MeetingStatus.POSTPONED) {
      throw new BadRequestException('Only a postponed meeting can be resumed.');
    }
    meeting.status = MeetingStatus.DRAFT;
    meeting.postponementReason = null;
    meeting.postponedAt = null;
    await meeting.save();
    return meeting;
  }

  // ── Public — no auth, resolved purely by an unguessable token ──

  async getAckSnapshot(token: string) {
    const meeting = await this.meetingModel
      .findOne({ 'ackTokens.token': token })
      .lean();
    if (!meeting)
      throw new NotFoundException('This acknowledgement link is invalid.');
    const tokenEntry = (meeting.ackTokens as any[]).find(
      (t) => t.token === token,
    );
    const already = (meeting.acknowledgments as any[]).some(
      (a) => a.attendeeEmail === tokenEntry.attendeeEmail,
    );
    const expired =
      Date.now() - new Date(tokenEntry.createdAt).getTime() >
      ACK_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    return {
      meetingId: meeting._id,
      expired,
      title: meeting.title,
      type: meeting.type,
      date: meeting.date,
      mode: meeting.mode,
      venue: meeting.venue,
      platform: meeting.platform,
      chair: meeting.chair,
      notes: meeting.notes,
      attendeeCount: meeting.attendees.length,
      agenda: meeting.agenda,
      boardPack: meeting.boardPack.map((d: any) => ({
        name: d.name,
        fileUrl: d.fileUrl,
        mimeType: d.mimeType,
      })),
      prefillName: tokenEntry.attendeeName,
      prefillEmail: tokenEntry.attendeeEmail,
      alreadyAcknowledged: already,
    };
  }

  async submitAck(token: string, dto: SubmitAckDto) {
    const meeting = await this.meetingModel.findOne({
      'ackTokens.token': token,
    });
    if (!meeting)
      throw new NotFoundException('This acknowledgement link is invalid.');
    const tokenEntry = meeting.ackTokens.find((t) => t.token === token);
    if (!tokenEntry)
      throw new NotFoundException('This acknowledgement link is invalid.');

    const isExpired =
      Date.now() - tokenEntry.createdAt.getTime() >
      ACK_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    if (isExpired) {
      throw new BadRequestException(
        'This acknowledgement link has expired. Please contact the meeting organiser for a new one.',
      );
    }

    if (
      meeting.acknowledgments.some(
        (a) => a.attendeeEmail === tokenEntry.attendeeEmail,
      )
    ) {
      throw new BadRequestException(
        'This acknowledgement has already been submitted.',
      );
    }

    meeting.acknowledgments.push({
      attendeeName: dto.name || tokenEntry.attendeeName,
      attendeeEmail: tokenEntry.attendeeEmail,
      agendaConfirmed: dto.agendaConfirmed,
      documents: (dto.documents ?? []).map((d) => ({
        name: d.name,
        fileUrl: d.fileUrl ?? null,
        ackedAt: new Date(),
        method: d.method,
      })),
      confirmedAt: new Date(),
      signature: dto.signature,
    } as any);
    meeting.markModified('acknowledgments');
    await meeting.save();
    return { success: true };
  }

  // ── Public — minutes review, no auth ─────────────────────────

  async getMinutesReviewSnapshot(token: string) {
    const meeting = await this.meetingModel
      .findOne({ 'minutesReviewTokens.token': token })
      .lean();
    if (!meeting) throw new NotFoundException('This review link is invalid.');
    const tokenEntry = (meeting.minutesReviewTokens as any[]).find(
      (t) => t.token === token,
    );

    const priorApproval = (meeting.minutesReviews as any[]).find(
      (r) =>
        r.attendeeEmail === tokenEntry.attendeeEmail &&
        r.decision === 'approved',
    );

    return {
      title: meeting.title,
      type: meeting.type,
      date: meeting.date,
      chair: meeting.chair,
      pdfUrl: meeting.minutesPdfUrl,
      prefillName: tokenEntry.attendeeName,
      alreadyApproved: !!priorApproval,
      approvedAt: priorApproval?.submittedAt ?? null,
    };
  }

  async submitMinutesReview(token: string, dto: SubmitMinutesReviewDto) {
    const meeting = await this.meetingModel.findOne({
      'minutesReviewTokens.token': token,
    });
    if (!meeting) throw new NotFoundException('This review link is invalid.');
    const tokenEntry = meeting.minutesReviewTokens.find(
      (t) => t.token === token,
    );
    if (!tokenEntry)
      throw new NotFoundException('This review link is invalid.');

    const alreadyApproved = meeting.minutesReviews.some(
      (r) =>
        r.attendeeEmail === tokenEntry.attendeeEmail &&
        r.decision === 'approved',
    );
    if (alreadyApproved) {
      throw new BadRequestException('You have already approved these minutes.');
    }

    meeting.minutesReviews.push({
      attendeeEmail: tokenEntry.attendeeEmail,
      attendeeName: dto.name || tokenEntry.attendeeName,
      decision: dto.decision,
      comment: dto.comment ?? '',
      submittedAt: new Date(),
    } as any);
    meeting.markModified('minutesReviews');
    await meeting.save();
    return { success: true };
  }

  private computeLocation(dto: {
    mode: MeetingMode;
    venue?: string;
    platform?: string;
    meetingLink?: string;
  }): string {
    if (dto.mode === MeetingMode.PHYSICAL) return dto.venue ?? '';
    return `${dto.platform ?? ''} — ${dto.meetingLink ?? ''}`;
  }

  private async resolveChairEmail(
    tenantId: string,
    meeting: GovernanceMeetingDocument,
  ): Promise<string | null> {
    const chairName = meeting.chair?.trim().toLowerCase();
    if (!chairName) return null;

    if (meeting.type === 'Board') {
      const boardMembers = await this.boardMemberService.getAll(tenantId);
      const match = boardMembers.find(
        (b: any) => b.name.trim().toLowerCase() === chairName,
      );
      return match?.email ?? null;
    }

    if (meeting.type === 'Committee' && meeting.committeeId) {
      const committee = await this.committeeService.getById(
        tenantId,
        meeting.committeeId.toString(),
      );
      const match = committee.members.find(
        (m) => m.name.trim().toLowerCase() === chairName,
      );
      return match?.email ?? null;
    }

    return null;
  }

  private ensureAckToken(
    meeting: GovernanceMeetingDocument,
    email: string,
    name: string,
  ): string {
    const existing = meeting.ackTokens.find(
      (t) => t.attendeeEmail.toLowerCase() === email.toLowerCase(),
    );
    if (existing) return existing.token;
    const token = randomBytes(24).toString('hex');
    meeting.ackTokens.push({
      token,
      attendeeEmail: email.toLowerCase(),
      attendeeName: name,
      createdAt: new Date(),
    } as any);
    meeting.markModified('ackTokens');
    return token;
  }

  private async generateMinutesPdf(
    meeting: GovernanceMeetingDocument,
    businessName: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.renderAutoHeader(doc, meeting, businessName);
      renderRichText(doc, meeting.minutes ?? '');

      doc.end();
    });
  }

  private ensureMinutesReviewToken(
    meeting: GovernanceMeetingDocument,
    email: string,
    name: string,
  ): string {
    const existing = meeting.minutesReviewTokens.find(
      (t) => t.attendeeEmail.toLowerCase() === email.toLowerCase(),
    );
    if (existing) return existing.token;
    const token = randomBytes(24).toString('hex');
    meeting.minutesReviewTokens.push({
      token,
      attendeeEmail: email.toLowerCase(),
      attendeeName: name,
      createdAt: new Date(),
    } as any);
    meeting.markModified('minutesReviewTokens');
    return token;
  }

  private renderAutoHeader(
    doc: PDFKit.PDFDocument,
    meeting: GovernanceMeetingDocument,
    businessName: string,
  ): void {
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(businessName, { align: 'center' });
    doc.moveDown(0.15);
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .text(`MINUTES OF THE ${meeting.type.toUpperCase()} MEETING`, {
        align: 'center',
      });
    doc.moveDown(0.6);

    doc.fontSize(11);
    const line = (label: string, value: string) => {
      doc
        .font('Helvetica-Bold')
        .text(`${label}: `, { continued: true })
        .font('Helvetica')
        .text(value);
    };
    line('Meeting', meeting.title);
    line('Date', new Date(meeting.date).toLocaleDateString());
    line('Time', new Date(meeting.date).toLocaleTimeString());
    line(
      'Venue',
      meeting.mode === 'Online'
        ? `Virtual (${meeting.platform ?? ''})`
        : (meeting.venue ?? meeting.location),
    );
    doc.moveDown(0.6);

    doc.fontSize(12).font('Helvetica-Bold').text('1. Attendance');
    doc.moveDown(0.25);

    if (!meeting.attendanceRecordedAt) {
      doc
        .fontSize(11)
        .font('Helvetica-Oblique')
        .fillColor('#b45309')
        .text('Attendance has not been recorded for this meeting.');
      doc.fillColor('#000000');
      doc.moveDown(0.8);
      return;
    }

    const presentIdx = meeting.attendanceAllPresent
      ? meeting.attendees.map((_, i) => i)
      : meeting.attendancePresentIndices;
    const absentIdx = meeting.attendees
      .map((_, i) => i)
      .filter((i) => !presentIdx.includes(i));

    doc.fontSize(11).font('Helvetica-Bold').text('Present:');
    presentIdx.forEach((i) => {
      const a = meeting.attendees[i];
      if (a)
        doc
          .font('Helvetica')
          .text(`•  ${a.name}${a.role ? ` – ${a.role}` : ''}`, { indent: 15 });
    });

    if (absentIdx.length > 0) {
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').text('Absent:');
      absentIdx.forEach((i) => {
        const a = meeting.attendees[i];
        const noteEntry = meeting.attendanceAbsenceNotes?.find(
          (n) => n.index === i,
        );
        const suffix = noteEntry?.note ? ` (${noteEntry.note})` : '';
        if (a)
          doc
            .font('Helvetica')
            .text(`•  ${a.name}${a.role ? ` – ${a.role}` : ''}${suffix}`, {
              indent: 15,
            });
      });
    }
    doc.moveDown(0.8);
  }
}
