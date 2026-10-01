import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ACK_TOKEN_EXPIRY_DAYS,
  GovernanceMeeting,
  GovernanceMeetingDocument,
  MeetingAudienceType,
  MeetingMode,
  MeetingStatus,
  MeetingActionItemStatus,
  NoticeRsvpStatus,
  MinutesDraftStatus,
  MeetingAttendanceStatus,
  MeetingConflictStatus,
  MeetingConflictAction,
  MeetingConflictSource,
  ConflictType,
  AgendaItemType,
} from '../schemas';
import {
  MEETING_CHECKLIST_ITEMS,
  MEETING_CHECKLIST_ITEM_IDS,
} from '../constants/meeting-checklist.constant';
import {
  CreateMeetingDto,
  AddAttendeeDto,
  AddAgendaItemDto,
  UpdateNotesDto,
  UpdateMinutesDto,
  RecordAttendanceDto,
  SubmitAckDto,
  SubmitMinutesReviewDto,
  AddActionItemDto,
  SetActionItemStatusDto,
  SubmitBoardMemberAckDto,
  SetChecklistItemDto,
  UpdateNoticeDto,
  SubmitNoticeRsvpDto,
  SubmitPublicNoticeRsvpDto,
  UpdateMinutesDraftDto,
  SetMinutesDraftStatusDto,
  ToggleBoardPackReadDto,
  AddBoardPackNoteDto,
  RecordMeetingConflictDto,
  SubmitMeetingConflictDto,
  AddBoardPackRequirementDto,
  UpdateBoardPackDueDateDto,
} from '../dtos/index.dto';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { join } from 'path';
import { BoardMemberService } from './board-member.service';
import { CommitteeService } from './committee.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
// Direct model injection across the HR/GRC module boundary — not
// EmployeeService — per this codebase's established fix for
// cross-module DI breaking at runtime (see AuditService/
// OrgStructureService's identical Employee injection).
import {
  Employee,
  EmployeeDocument,
} from 'src/modules/hr/schemas/employee.schema';
import { randomBytes } from 'crypto';
import {
  renderRichText,
  htmlToPlainText,
} from 'src/common/utils/pdf/render-rich-text.util';
import { buildReportPdf } from 'src/common/utils/pdf/report-builder.util';
import * as PDFKitImport from 'pdfkit';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const PDFDocument = ((PDFKitImport as any).default ??
  PDFKitImport) as typeof import('pdfkit');

@Injectable()
export class MeetingService {
  constructor(
    @InjectModel(GovernanceMeeting.name)
    private readonly meetingModel: Model<GovernanceMeetingDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly emailService: EmailService,
    private readonly boardMemberService: BoardMemberService,
    private readonly committeeService: CommitteeService,
    private readonly eventEmitter: EventEmitter2,
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

    const attendees = await this.computeAutoAttendees(tenantId, dto);

    return this.meetingModel.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      type: dto.type,
      date: new Date(dto.date),
      timezone: dto.timezone,
      mode: dto.mode,
      venue: dto.venue ?? null,
      meetingLink: dto.meetingLink ?? null,
      platform: dto.platform ?? null,
      location: this.computeLocation(dto),
      chair: dto.chair,
      committeeId: dto.committeeId ? new Types.ObjectId(dto.committeeId) : null,
      notes: dto.notes ?? '',
      status: MeetingStatus.DRAFT,
      attendees,
      agenda: [],
      boardPack: [],
    });
  }

  // A Board meeting's attendees are always every active board member;
  // a Committee meeting's attendees are always the selected
  // committee's current members. Neither is manually built up one
  // attendee at a time any more — see addAttendee/removeAttendee
  // below, which now reject Board/Committee meetings outright.
  // Executive/Ad-hoc meetings have no natural roster source, so they
  // keep the old manual add/remove flow.
  private async computeAutoAttendees(
    tenantId: string,
    dto: CreateMeetingDto,
  ): Promise<{ name: string; email: string; role: string }[]> {
    if (dto.type === MeetingAudienceType.BOARD) {
      const boardMembers = await this.boardMemberService.getAll(tenantId);
      return (boardMembers as any[])
        .filter((b) => b.isActive)
        .map((b) => ({
          name: b.name,
          email: b.email,
          role: b.role || 'Director',
        }));
    }
    if (dto.type === MeetingAudienceType.COMMITTEE && dto.committeeId) {
      const committee = await this.committeeService.getById(
        tenantId,
        dto.committeeId,
      );
      return committee.members.map((m) => ({
        name: m.name,
        email: m.email,
        role: m.role,
      }));
    }
    return [];
  }

  async getAll(tenantId: string) {
    const meetings = await this.meetingModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ date: -1 })
      .lean();
    // .lean() skips schema-default hydration, so a meeting created
    // before `actionItems`/`checklist`/`notice`/`minutesDraft` existed
    // on the schema comes back with those fields simply absent rather
    // than their defaults — same read-path-normalization fix used
    // throughout this codebase (audit folders, Board Management
    // fields, Governance Codes boardApprovals, …).
    return meetings.map((m: any) => ({
      ...m,
      timezone: m.timezone ?? 'UTC',
      actionItems: m.actionItems ?? [],
      checklist: m.checklist ?? [],
      notice: m.notice ?? {
        body: '',
        minimumDays: 14,
        rsvpDeadline: null,
        dispatchedAt: null,
        dispatchedBy: null,
        recipients: [],
        rsvpTokens: [],
      },
      minutesDraft: m.minutesDraft ?? null,
      boardPackNotes: m.boardPackNotes ?? [],
      attendanceEntries: m.attendanceEntries ?? [],
      conflictDeclarations: m.conflictDeclarations ?? [],
      postponementHistory: m.postponementHistory ?? [],
      boardPackDueDate: m.boardPackDueDate ?? null,
      agenda: (m.agenda ?? []).map((a: any) => ({
        ...a,
        type: a.type ?? AgendaItemType.NOTING,
      })),
      boardPack: (m.boardPack ?? []).map((d: any) => ({
        ...d,
        agendaItemTitle: d.agendaItemTitle ?? '',
        required: d.required ?? true,
        assignedToEmployeeId: d.assignedToEmployeeId ?? null,
        assignedToName: d.assignedToName ?? '',
        dueDate: d.dueDate ?? null,
        uploadedBy: d.uploadedBy ?? '',
      })),
    }));
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

  // Only an Executive/Ad-hoc meeting — with no auto-populated roster
  // — can still have attendees added/removed by hand.
  private assertManualAttendeesAllowed(meeting: GovernanceMeetingDocument) {
    if (
      meeting.type === MeetingAudienceType.BOARD ||
      meeting.type === MeetingAudienceType.COMMITTEE
    ) {
      throw new BadRequestException(
        `Attendees for a ${meeting.type} meeting are automatic — every ${
          meeting.type === MeetingAudienceType.BOARD
            ? 'active board member'
            : "the selected committee's member"
        } is invited, managed from the Board roster/committee membership rather than added here.`,
      );
    }
  }

  async addAttendee(tenantId: string, id: string, dto: AddAttendeeDto) {
    const meeting = await this.getById(tenantId, id);
    this.assertManualAttendeesAllowed(meeting);
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
    this.assertManualAttendeesAllowed(meeting);
    meeting.attendees.splice(index, 1);
    meeting.markModified('attendees');
    await meeting.save();
    return meeting;
  }

  async addAgendaItem(tenantId: string, id: string, dto: AddAgendaItemDto) {
    const meeting = await this.getById(tenantId, id);
    // The presenter is picked from the meeting's own attendees (a
    // dropdown on the frontend) rather than typed — validated here in
    // case anything ever posts directly to this endpoint.
    if (
      dto.presenter &&
      meeting.attendees.length > 0 &&
      !meeting.attendees.some(
        (a) =>
          a.name.trim().toLowerCase() === dto.presenter!.trim().toLowerCase(),
      )
    ) {
      throw new BadRequestException(
        "The presenter must be one of this meeting's attendees.",
      );
    }
    meeting.agenda.push({
      title: dto.title,
      presenter: dto.presenter ?? '',
      durationMinutes: dto.durationMinutes ?? 10,
      type: dto.type ?? AgendaItemType.NOTING,
    } as any);
    meeting.markModified('agenda');
    await meeting.save();
    return meeting;
  }

  async removeAgendaItem(tenantId: string, id: string, index: number) {
    const meeting = await this.getById(tenantId, id);
    const removedTitle = meeting.agenda[index]?.title;
    meeting.agenda.splice(index, 1);
    meeting.markModified('agenda');
    // A board-pack document filed under this item moves to the
    // general "Procedural documents" bucket rather than being left
    // pointing at an agenda item that no longer exists.
    if (removedTitle) {
      meeting.boardPack.forEach((d) => {
        if (d.agendaItemTitle === removedTitle) d.agendaItemTitle = '';
      });
      meeting.markModified('boardPack');
    }
    await meeting.save();
    return meeting;
  }

  // Validates an optional agenda-item title against the meeting's own
  // agenda before filing a board-pack document under it — blank is
  // always allowed (the general "Procedural documents" bucket).
  private assertAgendaItemExists(
    meeting: GovernanceMeetingDocument,
    agendaItemTitle: string | undefined,
  ) {
    const title = agendaItemTitle?.trim();
    if (!title) return '';
    const match = meeting.agenda.some(
      (a) => a.title.trim().toLowerCase() === title.toLowerCase(),
    );
    if (!match) {
      throw new BadRequestException(
        "Select one of this meeting's own agenda items, or leave it blank for a general procedural document.",
      );
    }
    return title;
  }

  async addBoardPackDoc(
    tenantId: string,
    id: string,
    file: Express.Multer.File,
    agendaItemTitle: string | undefined,
    uploadedBy: string,
  ) {
    const meeting = await this.getById(tenantId, id);
    const title = this.assertAgendaItemExists(meeting, agendaItemTitle);
    meeting.boardPack.push({
      name: file.originalname,
      fileUrl: `/uploads/grc/meetings/board-pack/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
      agendaItemTitle: title,
      required: true,
      assignedToEmployeeId: null,
      assignedToName: '',
      dueDate: null,
      uploadedBy,
    } as any);
    meeting.markModified('boardPack');
    await meeting.save();
    return meeting;
  }

  // Creates an "Outstanding" placeholder row — a required document
  // the tenant is asking for but hasn't received yet — matching the
  // reference mockup's "Awaiting upload from CFO · Expected by 24
  // Aug" rows. Fulfilled later via fulfillBoardPackDoc (tenant side)
  // or submitMyBoardPackDoc (the assigned employee's own portal)
  // rather than creating a second, duplicate entry once the file
  // arrives.
  async addBoardPackRequirement(
    tenantId: string,
    id: string,
    dto: AddBoardPackRequirementDto,
  ) {
    const meeting = await this.getById(tenantId, id);
    const title = this.assertAgendaItemExists(meeting, dto.agendaItemTitle);

    // Assignee is a real Employee picked from a dropdown, resolved
    // here to a display-name snapshot (same convention as
    // AuditService#addRequest) — never trusted name/email text from
    // the client.
    let assignedToEmployeeId: Types.ObjectId | null = null;
    let assignedToName = '';
    if (dto.assignedToEmployeeId) {
      const emp = await this.employeeModel
        .findOne({
          _id: dto.assignedToEmployeeId,
          tenantId: new Types.ObjectId(tenantId),
        })
        .select('firstName lastName userId')
        .lean();
      if (!emp) throw new NotFoundException('Employee not found');
      assignedToEmployeeId = emp._id;
      assignedToName = `${emp.firstName} ${emp.lastName}`.trim();

      if (emp.userId) {
        this.eventEmitter.emit('grc.board_pack.document_requested', {
          tenantId,
          employeeUserId: emp.userId.toString(),
          meetingTitle: meeting.title,
          docName: dto.name,
          dueDate: dto.dueDate ?? null,
        });
      }
    }

    meeting.boardPack.push({
      name: dto.name,
      fileUrl: null,
      mimeType: null,
      size: 0,
      uploadedAt: new Date(),
      agendaItemTitle: title,
      required: true,
      assignedToEmployeeId,
      assignedToName,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      uploadedBy: '',
    } as any);
    meeting.markModified('boardPack');
    await meeting.save();
    return meeting;
  }

  // Attaches an uploaded file to an existing "Outstanding" row
  // instead of creating a duplicate — the name/agenda-item/assignee
  // the tenant originally asked for stays as the record of what was
  // requested; only the file and its upload metadata are filled in.
  // Tenant/company-secretary side — no ownership check, any
  // outstanding row can be fulfilled directly. The assigned
  // employee's own equivalent is submitMyBoardPackDoc below.
  async fulfillBoardPackDoc(
    tenantId: string,
    id: string,
    index: number,
    file: Express.Multer.File,
    uploadedBy: string,
  ) {
    const meeting = await this.getById(tenantId, id);
    const doc = meeting.boardPack[index];
    if (!doc) throw new NotFoundException('Board pack document not found');
    if (doc.fileUrl) {
      throw new BadRequestException(
        'This document already has a file — remove it and add a new one to replace it.',
      );
    }
    doc.fileUrl = `/uploads/grc/meetings/board-pack/${file.filename}`;
    doc.mimeType = file.mimetype;
    doc.size = file.size;
    doc.uploadedAt = new Date();
    doc.uploadedBy = uploadedBy;
    meeting.markModified('boardPack');
    await meeting.save();
    return meeting;
  }

  // ── Employee-facing board-pack document-request portal — same
  // pattern as AuditService#getMyRequests/submitRequestFiles: list
  // every outstanding-or-fulfilled row assigned to the logged-in
  // employee across all of the tenant's meetings, and let them
  // upload straight from their own "My board pack requests" page
  // rather than going through the company secretary. ───────────────
  async getMyBoardPackRequests(tenantId: string, employeeId: string) {
    const meetings = await this.meetingModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        'boardPack.assignedToEmployeeId': new Types.ObjectId(employeeId),
      })
      .select('title date boardPack')
      .lean();

    const out: any[] = [];
    for (const m of meetings as any[]) {
      (m.boardPack ?? []).forEach((doc: any, index: number) => {
        if (String(doc.assignedToEmployeeId) === String(employeeId)) {
          out.push({
            ...doc,
            meetingId: m._id.toString(),
            meetingTitle: m.title,
            meetingDate: m.date,
            index,
          });
        }
      });
    }
    return out.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }

  async submitMyBoardPackDoc(
    tenantId: string,
    employeeId: string,
    meetingId: string,
    index: number,
    file: Express.Multer.File,
    uploaderName: string,
  ) {
    const meeting = await this.getById(tenantId, meetingId);
    const doc = meeting.boardPack[index];
    if (!doc) throw new NotFoundException('Board pack document not found');
    if (String(doc.assignedToEmployeeId) !== String(employeeId)) {
      throw new ForbiddenException('This request is not assigned to you.');
    }
    if (doc.fileUrl) {
      throw new BadRequestException('This document already has a file.');
    }
    doc.fileUrl = `/uploads/grc/meetings/board-pack/${file.filename}`;
    doc.mimeType = file.mimetype;
    doc.size = file.size;
    doc.uploadedAt = new Date();
    doc.uploadedBy = uploaderName;
    meeting.markModified('boardPack');
    await meeting.save();

    // Fallback-to-tenant-account convention (AuditService#requestRecipient
    // does the same with leadUserId ?? tenantId): meetings have no
    // reliable company-secretary userId on the record to notify
    // directly, so the tenant owner account is the recipient.
    this.eventEmitter.emit('tenant.board_pack_document.submitted', {
      tenantId,
      recipientUserId: tenantId,
      meetingTitle: meeting.title,
      docName: doc.name,
      uploadedBy: uploaderName,
    });
    return meeting;
  }

  async removeBoardPackDoc(tenantId: string, id: string, index: number) {
    const meeting = await this.getById(tenantId, id);
    meeting.boardPack.splice(index, 1);
    meeting.markModified('boardPack');
    await meeting.save();
    return meeting;
  }

  // The reference mockup's "Board pack due: 26 August 2026 (7 days
  // before meeting)" banner — a tenant-set override when stored,
  // otherwise derived so every meeting has a sensible due date
  // without the tenant having to set one explicitly. Left to the
  // frontend to compute from `boardPackDueDate`/`date` (same
  // compute-over-store convention used for other derived display
  // values in this codebase) rather than widening every read
  // response with a second, always-present field.
  async updateBoardPackDueDate(
    tenantId: string,
    id: string,
    dto: UpdateBoardPackDueDateDto,
  ) {
    const meeting = await this.getById(tenantId, id);
    meeting.boardPackDueDate = dto.dueDate ? new Date(dto.dueDate) : null;
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
    if (meeting.checklist.length < MEETING_CHECKLIST_ITEMS.length) {
      throw new BadRequestException(
        'Complete the preparation checklist before dispatching the board pack.',
      );
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

    // Recipients who are also real board members get a second CTA to
    // their board portal — where this same meeting now shows up
    // in-app (see BoardPortalController#getMyMeetings) — alongside the
    // existing email-only acknowledgement link, matching the
    // "receive everything pertaining to it... both via email and on
    // their board portal" pattern already used for committees.
    const boardMembers = await this.boardMemberService.getAll(tenantId);
    const boardMemberEmails = new Set(
      (boardMembers as any[])
        .map((b) => b.email?.toLowerCase())
        .filter(Boolean),
    );

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
              boardPortalLink: boardMemberEmails.has(r.email.toLowerCase())
                ? `${process.env.BOARD_APP_URL}/meetings`
                : null,
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

  // Per-attendee attendance — Present / Proxy / Apology / Absent (see
  // MeetingAttendanceStatus), replacing the earlier present/absent-only
  // recording per the PO's explicit feedback that proxy attendance
  // must be distinguishable from in-person. The legacy
  // attendanceAllPresent/attendancePresentIndices/attendanceAbsenceNotes
  // fields are still derived and kept in sync here (a director present
  // in person OR by proxy counts toward "present" for those), so older
  // readers (the minutes PDF fallback, board-portal myAttendance) keep
  // working without a migration.
  async recordAttendance(
    tenantId: string,
    id: string,
    dto: RecordAttendanceDto,
  ) {
    const meeting = await this.getById(tenantId, id);
    const validIndices = new Set(meeting.attendees.map((_, i) => i));
    for (const e of dto.entries) {
      if (!validIndices.has(e.index)) {
        throw new BadRequestException(
          `Attendee index ${e.index} is not on this meeting's attendee list.`,
        );
      }
    }

    meeting.attendanceEntries = dto.entries.map((e) => ({
      index: e.index,
      status: e.status,
      proxyHolderName:
        e.status === MeetingAttendanceStatus.PROXY
          ? (e.proxyHolderName ?? null)
          : null,
      note: e.note ?? null,
    })) as any;

    const presentIndices = dto.entries
      .filter(
        (e) =>
          e.status === MeetingAttendanceStatus.PRESENT ||
          e.status === MeetingAttendanceStatus.PROXY,
      )
      .map((e) => e.index);
    meeting.attendanceAllPresent =
      presentIndices.length === meeting.attendees.length;
    meeting.attendancePresentIndices = presentIndices;
    meeting.attendanceAbsenceNotes = dto.entries
      .filter(
        (e) =>
          (e.status === MeetingAttendanceStatus.APOLOGY ||
            e.status === MeetingAttendanceStatus.ABSENT) &&
          e.note?.trim(),
      )
      .map((e) => ({ index: e.index, note: e.note!.trim() }));
    meeting.attendanceRecordedAt = new Date();
    meeting.markModified('attendanceEntries');
    meeting.markModified('attendanceAbsenceNotes');
    await meeting.save();
    return meeting;
  }

  async postponeMeeting(
    tenantId: string,
    id: string,
    reason: string,
    businessName: string,
    newDate?: string,
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
    const parsedNewDate = newDate ? new Date(newDate) : null;
    meeting.status = MeetingStatus.POSTPONED;
    meeting.postponementReason = reason.trim();
    meeting.postponedAt = new Date();
    meeting.postponementHistory.push({
      fromDate: originalDate,
      toDate: parsedNewDate,
      reason: meeting.postponementReason,
      postponedAt: meeting.postponedAt,
    } as any);
    meeting.markModified('postponementHistory');
    // Updating `date` directly (rather than a separate calendar record)
    // is what makes the new date/time show up on the board calendar
    // and My Meetings immediately — both read straight off this field.
    if (parsedNewDate) meeting.date = parsedNewDate;
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
            newDate: parsedNewDate,
            reason: meeting.postponementReason!,
            businessName,
          })
          .catch(() => {}),
      ),
    );

    return meeting;
  }

  // Deliberately no "resume" action: postponing already moves the meeting
  // to its new date (see above), and every list/dashboard that buckets
  // meetings into upcoming vs past reads the current `date`, not
  // `status`. So a meeting postponed to a future date reappears as
  // upcoming on its own — there's nothing left for a "resume" step to
  // do, and forcing one through an extra click only hid the meeting's
  // normal actions (postpone again, mark as held) behind it for no
  // reason. `status` stays Postponed as a historical marker (shown as a
  // banner/badge) until the meeting is held or postponed again.

  // ── Action items — real, per-meeting, assigned to a real attendee
  // (never free text). Replaces the tenant frontend's previous
  // hardcoded/local-only "action items" concept. ────────────────────

  async addActionItem(tenantId: string, id: string, dto: AddActionItemDto) {
    const meeting = await this.getById(tenantId, id);
    const attendee = meeting.attendees.find(
      (a) => a.email.toLowerCase() === dto.assigneeEmail.toLowerCase(),
    );
    if (!attendee) {
      throw new BadRequestException(
        'The assignee must already be an attendee of this meeting — add them under Attendees first.',
      );
    }
    // Best-effort link to a real BoardMember, so a director's own
    // "My action items" view on the board portal can filter to items
    // assigned to them — null for an Employee/guest attendee, who has
    // no BoardMember record.
    const boardMembers = await this.boardMemberService.getAll(tenantId);
    const boardMatch = (boardMembers as any[]).find(
      (b) => b.email?.toLowerCase() === attendee.email.toLowerCase(),
    );
    meeting.actionItems.push({
      title: dto.title,
      description: dto.description ?? '',
      assigneeName: attendee.name,
      assigneeEmail: attendee.email,
      assigneeBoardMemberId: boardMatch ? boardMatch._id : null,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      status: MeetingActionItemStatus.OPEN,
      completedAt: null,
      createdAt: new Date(),
    } as any);
    meeting.markModified('actionItems');
    await meeting.save();
    return meeting;
  }

  async removeActionItem(tenantId: string, id: string, actionItemId: string) {
    const meeting = await this.getById(tenantId, id);
    const before = meeting.actionItems.length;
    meeting.actionItems = meeting.actionItems.filter(
      (a: any) => a._id.toString() !== actionItemId,
    ) as any;
    if (meeting.actionItems.length === before) {
      throw new NotFoundException('Action item not found');
    }
    meeting.markModified('actionItems');
    await meeting.save();
    return meeting;
  }

  async setActionItemStatus(
    tenantId: string,
    id: string,
    actionItemId: string,
    dto: SetActionItemStatusDto,
  ) {
    const meeting = await this.getById(tenantId, id);
    const item = (meeting.actionItems as any[]).find(
      (a) => a._id.toString() === actionItemId,
    );
    if (!item) throw new NotFoundException('Action item not found');
    item.status = dto.status;
    item.completedAt =
      dto.status === MeetingActionItemStatus.DONE ? new Date() : null;
    meeting.markModified('actionItems');
    await meeting.save();
    return meeting;
  }

  // ── Preparation checklist — gates Dispatch. ─────────────────────

  async setChecklistItem(
    tenantId: string,
    id: string,
    itemId: string,
    dto: SetChecklistItemDto,
    actorName: string,
  ) {
    if (!MEETING_CHECKLIST_ITEM_IDS.includes(itemId)) {
      throw new BadRequestException('Unknown checklist item.');
    }
    const meeting = await this.getById(tenantId, id);
    const existingIdx = meeting.checklist.findIndex((c) => c.itemId === itemId);
    if (dto.completed) {
      const entry = { itemId, completedAt: new Date(), completedBy: actorName };
      if (existingIdx >= 0) meeting.checklist[existingIdx] = entry as any;
      else meeting.checklist.push(entry as any);
    } else if (existingIdx >= 0) {
      meeting.checklist.splice(existingIdx, 1);
    }
    meeting.markModified('checklist');
    await meeting.save();
    return meeting;
  }

  // ── Notice — drafted, then dispatched to every current attendee,
  // ahead of (and separate from) the board-pack Dispatch button.
  // Reminders (email + portal) run on a cron — see
  // MeetingNoticeReminderService, mirroring MeetingAckReminderService. ─

  async updateNotice(tenantId: string, id: string, dto: UpdateNoticeDto) {
    const meeting = await this.getById(tenantId, id);
    meeting.notice.body = dto.body;
    if (dto.minimumDays !== undefined)
      meeting.notice.minimumDays = dto.minimumDays;
    if (dto.rsvpDeadline !== undefined)
      meeting.notice.rsvpDeadline = new Date(dto.rsvpDeadline);
    meeting.markModified('notice');
    await meeting.save();
    return meeting;
  }

  async dispatchNotice(tenantId: string, id: string, businessName: string) {
    const meeting = await this.getById(tenantId, id);
    if (meeting.attendees.length === 0) {
      throw new BadRequestException('Add attendees before sending the notice.');
    }
    if (!meeting.notice.body?.trim()) {
      throw new BadRequestException('Draft the notice before sending it.');
    }

    meeting.notice.recipients = meeting.attendees.map((a) => ({
      name: a.name,
      email: a.email,
      rsvp: NoticeRsvpStatus.PENDING,
      openedAt: null,
      lastReminderSentAt: null,
    })) as any;

    const boardMembers = await this.boardMemberService.getAll(tenantId);
    const boardMemberEmails = new Set(
      (boardMembers as any[])
        .map((b) => b.email?.toLowerCase())
        .filter(Boolean),
    );

    // A real token per non-board-member recipient, so an Employee/
    // guest attendee with no portal login can still RSVP — mirrors
    // ensureAckToken. Board members RSVP in-app instead (see
    // submitBoardMemberNoticeRsvp).
    const rsvpLinkByEmail = new Map<string, string>();
    for (const r of meeting.attendees) {
      if (boardMemberEmails.has(r.email.toLowerCase())) continue;
      const token = this.ensureNoticeRsvpToken(meeting, r.email, r.name);
      rsvpLinkByEmail.set(
        r.email.toLowerCase(),
        `${process.env.TENANT_APP_URL}/meeting-notice/${token}`,
      );
    }

    meeting.notice.dispatchedAt = new Date();
    meeting.notice.dispatchedBy = businessName;
    meeting.markModified('notice');
    await meeting.save();

    await Promise.all(
      meeting.attendees.map((r) =>
        this.emailService
          .sendMeetingNotice({
            to: r.email,
            attendeeName: r.name,
            meetingTitle: meeting.title,
            date: meeting.date,
            location: meeting.location,
            chair: meeting.chair,
            noticeBody: meeting.notice.body,
            rsvpDeadline: meeting.notice.rsvpDeadline,
            rsvpLink: rsvpLinkByEmail.get(r.email.toLowerCase()) ?? null,
            boardPortalLink: boardMemberEmails.has(r.email.toLowerCase())
              ? `${process.env.BOARD_APP_URL}/meetings`
              : null,
            businessName,
          })
          .catch(() => {}),
      ),
    );

    return meeting;
  }

  // "Resend to non-respondents" — re-sends the notice email only to
  // recipients who haven't RSVP'd yet (still Pending), rather than
  // spamming everyone who already confirmed or sent apologies.
  async resendNotice(tenantId: string, id: string, businessName: string) {
    const meeting = await this.getById(tenantId, id);
    if (!meeting.notice.dispatchedAt) {
      throw new BadRequestException('The notice has not been sent yet.');
    }
    const pending = meeting.notice.recipients.filter(
      (r) => r.rsvp === NoticeRsvpStatus.PENDING,
    );
    if (pending.length === 0) {
      throw new BadRequestException(
        'Every recipient has already responded to this notice.',
      );
    }

    const boardMembers = await this.boardMemberService.getAll(tenantId);
    const boardMemberEmails = new Set(
      (boardMembers as any[])
        .map((b) => b.email?.toLowerCase())
        .filter(Boolean),
    );

    const rsvpLinkByEmail = new Map<string, string>();
    for (const r of pending) {
      if (boardMemberEmails.has(r.email.toLowerCase())) continue;
      const token = this.ensureNoticeRsvpToken(meeting, r.email, r.name);
      rsvpLinkByEmail.set(
        r.email.toLowerCase(),
        `${process.env.TENANT_APP_URL}/meeting-notice/${token}`,
      );
    }
    meeting.markModified('notice');
    await meeting.save();

    await Promise.all(
      pending.map((r) =>
        this.emailService
          .sendMeetingNotice({
            to: r.email,
            attendeeName: r.name,
            meetingTitle: meeting.title,
            date: meeting.date,
            location: meeting.location,
            chair: meeting.chair,
            noticeBody: meeting.notice.body,
            rsvpDeadline: meeting.notice.rsvpDeadline,
            rsvpLink: rsvpLinkByEmail.get(r.email.toLowerCase()) ?? null,
            boardPortalLink: boardMemberEmails.has(r.email.toLowerCase())
              ? `${process.env.BOARD_APP_URL}/meetings`
              : null,
            businessName,
          })
          .catch(() => {}),
      ),
    );

    return { success: true, resentTo: pending.length };
  }

  // Generated on demand (never cached to disk, unlike minutes) so it
  // always reflects the current recipients table — RSVPs and opens
  // keep changing after dispatch, right up to the meeting.
  async downloadNoticePdf(
    tenantId: string,
    id: string,
    businessName: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const meeting = await this.getById(tenantId, id);
    if (!meeting.notice.dispatchedAt) {
      throw new BadRequestException('The notice has not been sent yet.');
    }
    const buffer = await this.generateNoticePdf(meeting, businessName);
    const filename = `${meeting.title.replace(/[^a-z0-9]+/gi, '-')}-notice.pdf`;
    return { buffer, filename };
  }

  // ── Meeting-specific conflict of interest — recorded either by the
  // tenant (from the Attendance register) or by the board member
  // themselves from their own portal. Both write to the same array so
  // the minutes draft can pull from one place regardless of source. ──

  private resolveMeetingConflictDto(
    meeting: GovernanceMeetingDocument,
    dto: {
      agendaItems?: string[];
      natureOfConflict: string;
      actionTaken?: any;
    },
  ) {
    const nature = dto.natureOfConflict?.trim();
    if (!nature) {
      throw new BadRequestException('Describe the nature of the conflict.');
    }
    const validTitles = new Set(meeting.agenda.map((a) => a.title));
    const agendaItems = (dto.agendaItems ?? []).filter((t) =>
      validTitles.has(t),
    );
    return { natureOfConflict: nature, agendaItems };
  }

  // No status is picked by the self-declaring board member (their
  // dialog has no status field — see SubmitMeetingConflictDto), so it
  // is inferred from the action they did choose: a recusal action
  // implies the conflict requires recusal, "noted" implies it doesn't,
  // and "referred" is treated as requiring recusal until the
  // Nominations Committee says otherwise. No action picked at all
  // falls back to the generic "noted" state.
  private inferConflictStatus(
    actionTaken?: MeetingConflictAction,
  ): MeetingConflictStatus {
    if (
      actionTaken === MeetingConflictAction.RECUSE_DISCUSSION_AND_VOTE ||
      actionTaken === MeetingConflictAction.RECUSE_VOTE_ONLY ||
      actionTaken === MeetingConflictAction.REFERRED_TO_NOMCO
    ) {
      return MeetingConflictStatus.DECLARED_RECUSAL_REQUIRED;
    }
    return MeetingConflictStatus.DECLARED_NOTED_NO_RECUSAL;
  }

  // When a conflict is recorded as a standing (ongoing, not just
  // meeting-specific) declaration, it also gets pushed onto the
  // declarer's own BoardMember#conflicts register — the "director's
  // standing conflict register" the reference Conflict-of-Interest
  // dialog's hint text refers to. Best-effort: a failure here must
  // never block recording the meeting-level declaration itself.
  private async linkToStandingRegister(
    tenantId: string,
    boardMemberId: Types.ObjectId | string | null,
    natureOfConflict: string,
  ): Promise<void> {
    if (!boardMemberId) return;
    try {
      await this.boardMemberService.recordConflict(
        tenantId,
        boardMemberId.toString(),
        { note: natureOfConflict, type: ConflictType.STANDING } as any,
      );
    } catch {
      // best-effort — the meeting-level declaration already saved
    }
  }

  async recordConflict(
    tenantId: string,
    id: string,
    dto: RecordMeetingConflictDto,
    recordedByName: string,
  ) {
    const meeting = await this.getById(tenantId, id);
    const lowerEmail = dto.declaredByEmail.toLowerCase();
    const attendee = meeting.attendees.find(
      (a) => a.email.toLowerCase() === lowerEmail,
    );
    if (!attendee) {
      throw new BadRequestException(
        'The person declaring a conflict must be an attendee of this meeting.',
      );
    }
    const { natureOfConflict, agendaItems } = this.resolveMeetingConflictDto(
      meeting,
      dto,
    );
    const boardMembers = await this.boardMemberService.getAll(tenantId);
    const boardMatch = (boardMembers as any[]).find(
      (b) => b.email?.toLowerCase() === lowerEmail,
    );
    const status = dto.status ?? this.inferConflictStatus(dto.actionTaken);
    meeting.conflictDeclarations.push({
      declaredByName: attendee.name,
      declaredByEmail: lowerEmail,
      declaredByBoardMemberId: boardMatch ? boardMatch._id : null,
      status,
      agendaItems,
      natureOfConflict,
      actionTaken: dto.actionTaken ?? undefined,
      recordedBy: recordedByName,
      recordedAt: new Date(),
      source: MeetingConflictSource.TENANT,
    } as any);
    meeting.markModified('conflictDeclarations');
    await meeting.save();
    if (status === MeetingConflictStatus.STANDING && boardMatch) {
      await this.linkToStandingRegister(
        tenantId,
        boardMatch._id,
        natureOfConflict,
      );
    }
    return meeting;
  }

  // Board portal, self-service — a director declares their own
  // conflict of interest for this meeting, rather than relying on the
  // tenant to record it on their behalf.
  async submitBoardMemberConflict(
    tenantId: string,
    id: string,
    boardMemberId: string,
    name: string,
    email: string,
    dto: SubmitMeetingConflictDto,
  ) {
    const meeting = await this.getById(tenantId, id);
    const lowerEmail = email.toLowerCase();
    const isAttendee = meeting.attendees.some(
      (a) => a.email.toLowerCase() === lowerEmail,
    );
    if (!isAttendee) {
      throw new BadRequestException(
        'You are not listed as an attendee of this meeting.',
      );
    }
    const { natureOfConflict, agendaItems } = this.resolveMeetingConflictDto(
      meeting,
      dto,
    );
    const status = this.inferConflictStatus(dto.actionTaken);
    meeting.conflictDeclarations.push({
      declaredByName: name,
      declaredByEmail: lowerEmail,
      declaredByBoardMemberId: new Types.ObjectId(boardMemberId),
      status,
      agendaItems,
      natureOfConflict,
      actionTaken: dto.actionTaken ?? undefined,
      recordedBy: name,
      recordedAt: new Date(),
      source: MeetingConflictSource.BOARD_MEMBER,
    } as any);
    meeting.markModified('conflictDeclarations');
    await meeting.save();
    return meeting;
  }

  private ensureNoticeRsvpToken(
    meeting: GovernanceMeetingDocument,
    email: string,
    name: string,
  ): string {
    const existing = meeting.notice.rsvpTokens.find(
      (t) => t.attendeeEmail.toLowerCase() === email.toLowerCase(),
    );
    if (existing) return existing.token;
    const token = randomBytes(24).toString('hex');
    meeting.notice.rsvpTokens.push({
      token,
      attendeeEmail: email.toLowerCase(),
      attendeeName: name,
      createdAt: new Date(),
      lastReminderSentAt: null,
    } as any);
    meeting.markModified('notice');
    return token;
  }

  // Public — token-resolved, no auth (Employee/guest attendee).
  async getNoticeRsvpSnapshot(token: string) {
    const meeting = await this.meetingModel
      .findOne({ 'notice.rsvpTokens.token': token })
      .lean();
    if (!meeting) throw new NotFoundException('This RSVP link is invalid.');
    const tokenEntry = (meeting.notice.rsvpTokens as any[]).find(
      (t) => t.token === token,
    );
    const recipient = (meeting.notice.recipients as any[]).find(
      (r) => r.email?.toLowerCase() === tokenEntry.attendeeEmail,
    );
    return {
      title: meeting.title,
      type: meeting.type,
      date: meeting.date,
      location: meeting.location,
      chair: meeting.chair,
      noticeBody: meeting.notice.body,
      rsvpDeadline: meeting.notice.rsvpDeadline,
      prefillName: tokenEntry.attendeeName,
      currentRsvp: recipient?.rsvp ?? 'Pending',
    };
  }

  async submitPublicNoticeRsvp(token: string, dto: SubmitPublicNoticeRsvpDto) {
    const meeting = await this.meetingModel.findOne({
      'notice.rsvpTokens.token': token,
    });
    if (!meeting) throw new NotFoundException('This RSVP link is invalid.');
    const tokenEntry = meeting.notice.rsvpTokens.find((t) => t.token === token);
    if (!tokenEntry) throw new NotFoundException('This RSVP link is invalid.');

    const recipient = meeting.notice.recipients.find(
      (r) => r.email.toLowerCase() === tokenEntry.attendeeEmail,
    );
    if (!recipient)
      throw new NotFoundException('You are not listed for this notice.');
    recipient.rsvp = dto.rsvp;
    if (!recipient.openedAt) recipient.openedAt = new Date();
    meeting.markModified('notice');
    await meeting.save();
    return { success: true };
  }

  // Board portal, self-service — RSVP in-app rather than via an
  // emailed token link, matching submitBoardMemberAck's pattern.
  async submitBoardMemberNoticeRsvp(
    tenantId: string,
    id: string,
    email: string,
    dto: SubmitNoticeRsvpDto,
  ) {
    const meeting = await this.getById(tenantId, id);
    const lowerEmail = email.toLowerCase();
    const recipient = meeting.notice.recipients.find(
      (r) => r.email.toLowerCase() === lowerEmail,
    );
    if (!recipient) {
      throw new BadRequestException(
        'No notice has been sent to you for this meeting yet.',
      );
    }
    recipient.rsvp = dto.rsvp;
    if (!recipient.openedAt) recipient.openedAt = new Date();
    meeting.markModified('notice');
    await meeting.save();
    return meeting;
  }

  async markNoticeOpened(tenantId: string, id: string, email: string) {
    const meeting = await this.getById(tenantId, id);
    const lowerEmail = email.toLowerCase();
    const recipient = meeting.notice.recipients.find(
      (r) => r.email.toLowerCase() === lowerEmail,
    );
    if (recipient && !recipient.openedAt) {
      recipient.openedAt = new Date();
      meeting.markModified('notice');
      await meeting.save();
    }
    return { success: true };
  }

  // ── Structured minutes drafting — sections generated client-side
  // from the agenda, edited here, then rendered to HTML client-side
  // and saved through the existing updateMinutes()/sendMinutes() flow. ─

  async updateMinutesDraft(
    tenantId: string,
    id: string,
    dto: UpdateMinutesDraftDto,
    actorName: string,
  ) {
    const meeting = await this.getById(tenantId, id);
    const prevStatus = meeting.minutesDraft?.status ?? MinutesDraftStatus.DRAFT;
    meeting.minutesDraft = {
      chair: dto.chair ?? meeting.minutesDraft?.chair ?? '',
      minuteTaker: dto.minuteTaker ?? meeting.minutesDraft?.minuteTaker ?? '',
      quorumText: dto.quorumText ?? meeting.minutesDraft?.quorumText ?? '',
      conflicts: dto.conflicts ?? meeting.minutesDraft?.conflicts ?? '',
      sections: dto.sections as any,
      actions: dto.actions as any,
      status: prevStatus,
      updatedAt: new Date(),
      updatedBy: actorName,
    } as any;
    meeting.markModified('minutesDraft');
    await meeting.save();
    return meeting;
  }

  async setMinutesDraftStatus(
    tenantId: string,
    id: string,
    dto: SetMinutesDraftStatusDto,
    actorName: string,
  ) {
    const meeting = await this.getById(tenantId, id);
    if (!meeting.minutesDraft) {
      throw new BadRequestException('There is no minutes draft yet.');
    }
    meeting.minutesDraft.status = dto.status;
    meeting.minutesDraft.updatedAt = new Date();
    meeting.minutesDraft.updatedBy = actorName;
    meeting.markModified('minutesDraft');
    await meeting.save();
    return meeting;
  }

  // ── Board portal, self-service — everything a director sees on
  // "My Meetings": the real meetings they're actually invited to
  // (attendee email match), gated to Sent/Held/Postponed so a
  // still-drafting meeting they haven't been notified of isn't
  // visible early, plus their own attendance/RSVP/action items. ────

  async getForBoardMemberPortal(
    tenantId: string,
    boardMemberId: string,
    email: string,
  ) {
    const lowerEmail = email.toLowerCase();
    const meetings = await this.meetingModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        'attendees.email': lowerEmail,
        // Visible once either the notice or the board pack has gone
        // out — a director sees the meeting notice ahead of the pack
        // itself, while the meeting is technically still Draft.
        $or: [
          { status: { $ne: MeetingStatus.DRAFT } },
          { 'notice.dispatchedAt': { $ne: null } },
        ],
      })
      .sort({ date: -1 })
      .lean();

    return meetings.map((m: any) => {
      const idx = (m.attendees ?? []).findIndex(
        (a: any) => a.email?.toLowerCase() === lowerEmail,
      );
      const myNoticeRecipient = (m.notice?.recipients ?? []).find(
        (r: any) => r.email?.toLowerCase() === lowerEmail,
      );
      const myAttendance = m.attendanceRecordedAt
        ? m.attendanceAllPresent
          ? true
          : (m.attendancePresentIndices ?? []).includes(idx)
        : null;
      const myAttendanceEntry = (m.attendanceEntries ?? []).find(
        (e: any) => e.index === idx,
      );
      const myConflict =
        (m.conflictDeclarations ?? []).find(
          (c: any) => c.declaredByEmail?.toLowerCase() === lowerEmail,
        ) ?? null;
      const myAck =
        (m.acknowledgments ?? []).find(
          (a: any) => a.attendeeEmail?.toLowerCase() === lowerEmail,
        ) ?? null;
      const myActionItems = (m.actionItems ?? []).filter(
        (a: any) =>
          (a.assigneeBoardMemberId &&
            a.assigneeBoardMemberId.toString() === boardMemberId) ||
          a.assigneeEmail?.toLowerCase() === lowerEmail,
      );
      // Minutes are only shown once formally sent — a director isn't
      // shown a draft/unsent minutes text.
      const minutesReady = !!m.minutesSentAt;
      return {
        _id: m._id,
        title: m.title,
        type: m.type,
        committeeId: m.committeeId ?? null,
        date: m.date,
        mode: m.mode,
        location: m.location,
        chair: m.chair,
        status: m.status,
        agenda: m.agenda ?? [],
        boardPack: m.boardPack ?? [],
        minutes: minutesReady ? (m.minutes ?? null) : null,
        minutesPdfUrl: minutesReady ? (m.minutesPdfUrl ?? null) : null,
        minutesSentAt: m.minutesSentAt ?? null,
        notice: m.notice?.dispatchedAt
          ? {
              body: m.notice.body,
              rsvpDeadline: m.notice.rsvpDeadline ?? null,
              dispatchedAt: m.notice.dispatchedAt,
            }
          : null,
        myNoticeRsvp: myNoticeRecipient
          ? {
              rsvp: myNoticeRecipient.rsvp,
              openedAt: myNoticeRecipient.openedAt ?? null,
            }
          : null,
        myAttendance,
        myAttendanceStatus: myAttendanceEntry?.status ?? null,
        myConflict: myConflict
          ? {
              _id: myConflict._id,
              status: myConflict.status,
              agendaItems: myConflict.agendaItems ?? [],
              natureOfConflict: myConflict.natureOfConflict,
              actionTaken: myConflict.actionTaken,
              recordedAt: myConflict.recordedAt,
            }
          : null,
        myAck: myAck
          ? {
              agendaConfirmed: myAck.agendaConfirmed,
              confirmedAt: myAck.confirmedAt,
            }
          : null,
        // Board Packs page — this director's own reading progress
        // (which documents they've marked read, and whether they've
        // confirmed the whole pack), plus every note left on any of
        // this meeting's documents — shared among attendees and the
        // tenant, not private per-director.
        myBoardPack: {
          readFileUrls: (myAck?.documents ?? []).map((d: any) => d.fileUrl),
          allDocumentsRead: myAck?.allDocumentsRead ?? false,
          allDocumentsReadAt: myAck?.allDocumentsReadAt ?? null,
        },
        boardPackNotes: m.boardPackNotes ?? [],
        actionItems: myActionItems.map((a: any) => ({
          _id: a._id,
          title: a.title,
          description: a.description,
          dueDate: a.dueDate ?? null,
          status: a.status,
          completedAt: a.completedAt ?? null,
        })),
      };
    });
  }

  // A lightweight in-app RSVP, reusing the same MeetingAcknowledgment
  // shape the public emailed-link flow (submitAck) writes to, but
  // simplified: no per-document sign-off and no typed signature,
  // since the director is already an authenticated portal caller —
  // their own real name is used as the signature, never client-typed.
  // Re-submitting (e.g. changing Decline to Confirm) replaces this
  // director's existing entry rather than duplicating it, matching
  // the "re-signing replaces" convention used for CodeAcknowledgement.
  async submitBoardMemberAck(
    tenantId: string,
    id: string,
    email: string,
    name: string,
    dto: SubmitBoardMemberAckDto,
  ) {
    const meeting = await this.getById(tenantId, id);
    const lowerEmail = email.toLowerCase();
    const isAttendee = meeting.attendees.some(
      (a) => a.email.toLowerCase() === lowerEmail,
    );
    if (!isAttendee) {
      throw new BadRequestException(
        'You are not listed as an attendee of this meeting.',
      );
    }
    if (meeting.status === MeetingStatus.DRAFT) {
      throw new BadRequestException('This meeting has not been sent yet.');
    }
    const existingIdx = meeting.acknowledgments.findIndex(
      (a) => a.attendeeEmail.toLowerCase() === lowerEmail,
    );
    const entry = {
      attendeeName: name,
      attendeeEmail: lowerEmail,
      agendaConfirmed: dto.agendaConfirmed,
      documents: [],
      confirmedAt: new Date(),
      signature: name,
    };
    if (existingIdx >= 0) {
      meeting.acknowledgments[existingIdx] = entry as any;
    } else {
      meeting.acknowledgments.push(entry as any);
    }
    meeting.markModified('acknowledgments');
    await meeting.save();
    return meeting;
  }

  // ── Board Packs page — per-document reading, not just the one-shot
  // "acknowledge agenda" above. A director marks each board pack
  // document read individually (and can un-mark it), then confirms the
  // whole pack once every document is read. Reuses the same
  // MeetingAcknowledgment record submitBoardMemberAck writes to — the
  // first "mark read" toggle creates it if it doesn't exist yet, the
  // same "first touch creates the record" pattern used throughout this
  // module — so a director's agenda acknowledgement and their board
  // pack reading progress live on one record, not two. Documents are
  // matched by fileUrl (see BoardPackNote's schema comment). ─────────

  private findOrCreateMyAck(
    meeting: GovernanceMeetingDocument,
    email: string,
    name: string,
  ) {
    const lowerEmail = email.toLowerCase();
    let idx = meeting.acknowledgments.findIndex(
      (a) => a.attendeeEmail.toLowerCase() === lowerEmail,
    );
    if (idx < 0) {
      meeting.acknowledgments.push({
        attendeeName: name,
        attendeeEmail: lowerEmail,
        agendaConfirmed: false,
        documents: [],
        confirmedAt: new Date(),
        signature: name,
        allDocumentsRead: false,
        allDocumentsReadAt: null,
      } as any);
      idx = meeting.acknowledgments.length - 1;
    }
    return meeting.acknowledgments[idx];
  }

  async toggleBoardPackDocumentRead(
    tenantId: string,
    id: string,
    email: string,
    name: string,
    dto: ToggleBoardPackReadDto,
  ) {
    const meeting = await this.getById(tenantId, id);
    const lowerEmail = email.toLowerCase();
    const isAttendee = meeting.attendees.some(
      (a) => a.email.toLowerCase() === lowerEmail,
    );
    if (!isAttendee) {
      throw new BadRequestException(
        'You are not listed as an attendee of this meeting.',
      );
    }
    if (meeting.status === MeetingStatus.DRAFT) {
      throw new BadRequestException('This meeting has not been sent yet.');
    }
    const doc = meeting.boardPack.find((d) => d.fileUrl === dto.fileUrl);
    if (!doc) throw new NotFoundException('Board pack document not found.');

    const ack = this.findOrCreateMyAck(meeting, email, name);
    const docIdx = ack.documents.findIndex((d) => d.fileUrl === dto.fileUrl);
    if (dto.read) {
      if (docIdx < 0) {
        ack.documents.push({
          name: doc.name,
          fileUrl: doc.fileUrl,
          ackedAt: new Date(),
          method: 'in-app',
        } as any);
      }
    } else {
      if (docIdx >= 0) ack.documents.splice(docIdx, 1);
      // Unmarking a document means the pack is no longer fully read.
      ack.allDocumentsRead = false;
    }
    meeting.markModified('acknowledgments');
    await meeting.save();
    return meeting;
  }

  async confirmBoardPackRead(tenantId: string, id: string, email: string) {
    const meeting = await this.getById(tenantId, id);
    if (meeting.boardPack.length === 0) {
      throw new BadRequestException(
        'This meeting has no board pack documents yet.',
      );
    }
    const lowerEmail = email.toLowerCase();
    const idx = meeting.acknowledgments.findIndex(
      (a) => a.attendeeEmail.toLowerCase() === lowerEmail,
    );
    if (idx < 0) {
      throw new BadRequestException(
        'Mark every board pack document as read first.',
      );
    }
    const ack = meeting.acknowledgments[idx];
    const readUrls = new Set(ack.documents.map((d) => d.fileUrl));
    const allRead = meeting.boardPack.every((d) => readUrls.has(d.fileUrl));
    if (!allRead) {
      throw new BadRequestException(
        'Mark every board pack document as read first.',
      );
    }
    ack.allDocumentsRead = true;
    ack.allDocumentsReadAt = new Date();
    meeting.markModified('acknowledgments');
    await meeting.save();
    return meeting;
  }

  // A director's note/question on a board pack document — shared with
  // the tenant ("Company Secretary") and visible to other attendees on
  // the same document, per the board portal's reference design.
  async addBoardPackNote(
    tenantId: string,
    id: string,
    email: string,
    name: string,
    dto: AddBoardPackNoteDto,
  ) {
    const meeting = await this.getById(tenantId, id);
    const lowerEmail = email.toLowerCase();
    const isAttendee = meeting.attendees.some(
      (a) => a.email.toLowerCase() === lowerEmail,
    );
    if (!isAttendee) {
      throw new BadRequestException(
        'You are not listed as an attendee of this meeting.',
      );
    }
    const doc = meeting.boardPack.find((d) => d.fileUrl === dto.fileUrl);
    if (!doc) throw new NotFoundException('Board pack document not found.');
    const text = dto.text.trim();
    if (!text) throw new BadRequestException('Note cannot be empty.');
    meeting.boardPackNotes.push({
      fileUrl: dto.fileUrl,
      authorName: name,
      authorEmail: lowerEmail,
      text,
      createdAt: new Date(),
    } as any);
    meeting.markModified('boardPackNotes');
    await meeting.save();
    return meeting;
  }

  // Board portal, self-service — lets a director toggle one of their
  // own meeting action items (assigned to them via assigneeBoardMemberId
  // or, for an item that predates that link, their own email) Open/Done.
  // Reuses the same status/completedAt logic as the tenant-side
  // setActionItemStatus above, with an ownership check added so a
  // director can never touch an action item that isn't theirs.
  async setMyActionItemStatus(
    tenantId: string,
    boardMemberId: string,
    email: string,
    id: string,
    actionItemId: string,
    dto: SetActionItemStatusDto,
  ) {
    const meeting = await this.getById(tenantId, id);
    const item = (meeting.actionItems as any[]).find(
      (a) => a._id.toString() === actionItemId,
    );
    if (!item) throw new NotFoundException('Action item not found');
    const isMine =
      (item.assigneeBoardMemberId &&
        item.assigneeBoardMemberId.toString() === boardMemberId) ||
      item.assigneeEmail?.toLowerCase() === email.toLowerCase();
    if (!isMine) {
      throw new ForbiddenException('This action item is not assigned to you.');
    }
    item.status = dto.status;
    item.completedAt =
      dto.status === MeetingActionItemStatus.DONE ? new Date() : null;
    meeting.markModified('actionItems');
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

  // "Download notice PDF" — reuses the platform's standard report-PDF
  // house style (buildReportPdf) rather than the minutes' freeform
  // renderer, since this is a summary/table document, not rich text.
  private async generateNoticePdf(
    meeting: GovernanceMeetingDocument,
    businessName: string,
  ): Promise<Buffer> {
    const roleByEmail = new Map(
      meeting.attendees.map((a) => [a.email.toLowerCase(), a.role || '—']),
    );
    const dispatched = meeting.notice.dispatchedAt
      ? new Date(meeting.notice.dispatchedAt).toLocaleString()
      : '—';
    return buildReportPdf({
      title: `Meeting Notice — ${meeting.title}`,
      subtitle: `${new Date(meeting.date).toLocaleString()} · ${meeting.location}`,
      summary: [
        { label: 'Dispatched', value: dispatched },
        { label: 'Dispatched by', value: meeting.notice.dispatchedBy ?? '—' },
        {
          label: 'RSVP deadline',
          value: meeting.notice.rsvpDeadline
            ? new Date(meeting.notice.rsvpDeadline).toLocaleDateString()
            : '—',
        },
        { label: 'Recipients', value: meeting.notice.recipients.length },
      ],
      sections: [
        {
          heading: 'Recipients and dispatch status',
          // The notice body is rich text (the notice editor is a
          // RichTextEditor — see UpdateNoticeDto), but this report
          // builder's `note` is a plain-text field, not an HTML
          // renderer (unlike renderRichText, used for minutes) — so
          // it's flattened to readable text here rather than showing
          // raw markup.
          note: meeting.notice.body
            ? htmlToPlainText(meeting.notice.body)
            : undefined,
          columns: [
            'Recipient',
            'Role',
            'Email',
            'Dispatched',
            'Opened',
            'RSVP',
          ],
          rows: meeting.notice.recipients.map((r) => [
            r.name,
            roleByEmail.get(r.email.toLowerCase()) ?? '—',
            r.email,
            dispatched,
            r.openedAt ? new Date(r.openedAt).toLocaleString() : 'Not opened',
            r.rsvp,
          ]),
        },
      ],
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

    // attendanceEntries is the source of truth for any meeting
    // recorded since in-person/proxy tracking shipped; older meetings
    // fall back to the legacy present/absent-only fields.
    const entries =
      meeting.attendanceEntries && meeting.attendanceEntries.length > 0
        ? meeting.attendanceEntries
        : meeting.attendees.map((_, i) => ({
            index: i,
            status: (meeting.attendanceAllPresent ||
            meeting.attendancePresentIndices.includes(i)
              ? 'Present'
              : 'Absent') as any,
            proxyHolderName: null,
            note:
              meeting.attendanceAbsenceNotes?.find((n) => n.index === i)
                ?.note ?? null,
          }));

    const byStatus = (status: string) =>
      entries.filter((e) => e.status === status);

    const renderGroup = (label: string, list: typeof entries) => {
      if (list.length === 0) return;
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').text(`${label}:`);
      list.forEach((e) => {
        const a = meeting.attendees[e.index];
        if (!a) return;
        const proxySuffix =
          e.status === 'Proxy' && e.proxyHolderName
            ? ` (proxy held by ${e.proxyHolderName})`
            : '';
        const noteSuffix = e.note ? ` (${e.note})` : '';
        doc
          .font('Helvetica')
          .text(
            `•  ${a.name}${a.role ? ` – ${a.role}` : ''}${proxySuffix}${noteSuffix}`,
            { indent: 15 },
          );
      });
    };

    renderGroup('Present', byStatus('Present'));
    renderGroup('Present by proxy', byStatus('Proxy'));
    renderGroup('Apologies', byStatus('Apology'));
    renderGroup('Absent', byStatus('Absent'));
    doc.moveDown(0.8);

    // ── Conflicts of interest declared ─────────────────────────────
    if (meeting.conflictDeclarations.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').text('2. Conflicts of Interest');
      doc.moveDown(0.25);
      meeting.conflictDeclarations.forEach((c) => {
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .text(
            `•  ${c.declaredByName}${c.agendaItems?.length ? ` — re: ${c.agendaItems.join(', ')}` : ''}`,
            { indent: 15 },
          );
        doc
          .font('Helvetica')
          .text(`${c.natureOfConflict}. Action taken: ${c.actionTaken}.`, {
            indent: 25,
          });
      });
      doc.moveDown(0.8);
    }
  }
}
