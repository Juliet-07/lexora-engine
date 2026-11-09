import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  ReadinessWorkspace,
  ReadinessWorkspaceDocument,
  ReadinessAssessment,
  ReadinessAssessmentDocument,
  DATA_ROOM_TEMPLATE,
  PIPELINE_STAGES,
  effectiveRoomStatus,
} from '../schemas';
import {
  UpdateRoomItemDto,
  AddRoomItemDto,
  CreateShareDto,
  SendReportDto,
  AttachReportDto,
  AcceptNdaDto,
  ShareDownloadDto,
  CreateInvestorDto,
  UpdateInvestorDto,
  CreateQuestionDto,
  UpdateQuestionDto,
  DraftAnswerDto,
  CreateTaskDto,
  UpdateTaskDto,
  AddTaskCommentDto,
} from '../dtos';
import { ReadinessService } from './readiness.service';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';

const ACTIVITY_CAP = 400;
const LOG_CAP = 600;

@Injectable()
export class ReadinessWorkspaceService {
  private readonly logger = new Logger(ReadinessWorkspaceService.name);

  constructor(
    @InjectModel(ReadinessWorkspace.name)
    private readonly model: Model<ReadinessWorkspaceDocument>,
    @InjectModel(ReadinessAssessment.name)
    private readonly assessmentModel: Model<ReadinessAssessmentDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly readiness: ReadinessService,
    private readonly emailService: EmailService,
  ) {}

  // ── Workspace lifecycle ──────────────────────────────────────

  // One workspace per tenant, with the data room checklist laid out
  // empty on first use. Two requests racing to create it is harmless:
  // the unique tenantId index makes the loser read the winner's.
  private async ensure(tenantId: string): Promise<ReadinessWorkspaceDocument> {
    const tId = new Types.ObjectId(tenantId);
    const found = await this.model.findOne({ tenantId: tId });
    if (found) return found;
    try {
      return await this.model.create({
        tenantId: tId,
        room: DATA_ROOM_TEMPLATE.flatMap((c) =>
          c.items.map((name) => ({
            category: c.category,
            name,
            status: 'missing',
          })),
        ),
      });
    } catch (e: any) {
      if (e?.code === 11000) {
        const again = await this.model.findOne({ tenantId: tId });
        if (again) return again;
      }
      throw e;
    }
  }

  private log(
    ws: ReadinessWorkspaceDocument,
    type: string,
    text: string,
    by: string,
    detail = '',
  ) {
    ws.activity.push({ type, text, by, detail, at: new Date() } as any);
    if (ws.activity.length > ACTIVITY_CAP) {
      ws.activity.splice(0, ws.activity.length - ACTIVITY_CAP);
    }
  }

  private shareLog(
    ws: ReadinessWorkspaceDocument,
    share: any,
    action: string,
    detail = '',
  ) {
    ws.shareLog.push({
      shareId: share._id,
      investorName: share.investorName,
      action,
      detail,
      at: new Date(),
    } as any);
    if (ws.shareLog.length > LOG_CAP) {
      ws.shareLog.splice(0, ws.shareLog.length - LOG_CAP);
    }
  }

  private async persist(ws: ReadinessWorkspaceDocument, syncRoom = false) {
    await ws.save();
    if (syncRoom) await this.readiness.syncDataRoom(String(ws.tenantId));
    return this.view(ws);
  }

  // ── View ─────────────────────────────────────────────────────

  private shareState(s: any): 'active' | 'revoked' | 'expired' {
    if (s.status === 'revoked') return 'revoked';
    if (new Date(s.expiresAt).getTime() < Date.now()) return 'expired';
    return 'active';
  }

  private view(ws: ReadinessWorkspaceDocument) {
    const o: any = ws.toObject();
    const room = o.room.map((r: any) => ({
      ...r,
      status: effectiveRoomStatus(r),
      version: r.files?.length ?? 0,
    }));
    const shares = o.shares.map((s: any) => ({
      ...s,
      state: this.shareState(s),
    }));
    const investors = o.investors.map((i: any) => {
      const mine = shares.filter(
        (s: any) =>
          s.kind === 'room' &&
          ((s.investorId && String(s.investorId) === String(i._id)) ||
            (i.email && s.email.toLowerCase() === i.email.toLowerCase())),
      );
      const lastView = mine
        .map((s: any) => s.lastViewedAt)
        .filter(Boolean)
        .sort()
        .pop();
      return {
        ...i,
        engagement: {
          views: mine.reduce((n: number, s: any) => n + (s.views ?? 0), 0),
          downloads: mine.reduce(
            (n: number, s: any) => n + (s.downloads ?? 0),
            0,
          ),
          lastView: lastView ?? null,
          shares: mine.length,
        },
        questions: o.questions.filter(
          (q: any) => q.investorId && String(q.investorId) === String(i._id),
        ).length,
      };
    });
    return {
      room,
      shares: shares.sort(
        (a: any, b: any) => +new Date(b.sentAt) - +new Date(a.sentAt),
      ),
      shareLog: [...o.shareLog].sort(
        (a: any, b: any) => +new Date(b.at) - +new Date(a.at),
      ),
      investors,
      questions: [...o.questions].sort(
        (a: any, b: any) => +new Date(b.askedAt) - +new Date(a.askedAt),
      ),
      tasks: o.tasks,
      activity: [...o.activity].sort(
        (a: any, b: any) => +new Date(b.at) - +new Date(a.at),
      ),
      stages: PIPELINE_STAGES,
    };
  }

  async get(tenantId: string) {
    return this.view(await this.ensure(tenantId));
  }

  // ── Data room ────────────────────────────────────────────────

  async updateRoomItem(
    tenantId: string,
    itemId: string,
    dto: UpdateRoomItemDto,
    by: string,
  ) {
    const ws = await this.ensure(tenantId);
    const item = ws.room.id(itemId);
    if (!item) throw new NotFoundException('Document not found');
    const before = item.status;
    if (dto.name !== undefined && dto.name.trim()) item.name = dto.name.trim();
    if (dto.note !== undefined) item.note = dto.note;
    if (dto.expiresAt !== undefined) {
      item.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }
    if (dto.status !== undefined) {
      if (
        (dto.status === 'uploaded' || dto.status === 'review') &&
        item.files.length === 0
      ) {
        throw new BadRequestException(
          'Upload a file before marking this document as held.',
        );
      }
      item.status = dto.status;
    }
    item.updatedBy = by;
    item.updatedAt = new Date();
    if (dto.status !== undefined && dto.status !== before) {
      this.log(
        ws,
        'status',
        `Document status changed: ${item.name} → ${this.statusLabel(dto.status)}`,
        by,
        item.category + (item.note ? ` · ${item.note}` : ''),
      );
    }
    return this.persist(ws, true);
  }

  private statusLabel(s: string) {
    return (
      (
        {
          uploaded: 'Uploaded',
          missing: 'Missing',
          review: 'Under review',
          expired: 'Expired',
          not_applicable: 'N/A',
        } as any
      )[s] ?? s
    );
  }

  async addRoomItem(tenantId: string, dto: AddRoomItemDto, by: string) {
    const ws = await this.ensure(tenantId);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Document name is required.');
    ws.room.push({ category: dto.category, name, status: 'missing' } as any);
    this.log(ws, 'system', `Added to the checklist: ${name}`, by, dto.category);
    return this.persist(ws, true);
  }

  async removeRoomItem(tenantId: string, itemId: string, by: string) {
    const ws = await this.ensure(tenantId);
    const item = ws.room.id(itemId);
    if (!item) throw new NotFoundException('Document not found');
    this.log(
      ws,
      'system',
      `Removed from the checklist: ${item.name}`,
      by,
      item.category,
    );
    item.deleteOne();
    return this.persist(ws, true);
  }

  async uploadRoomFile(
    tenantId: string,
    itemId: string,
    file: Express.Multer.File,
    by: string,
  ) {
    const ws = await this.ensure(tenantId);
    const item = ws.room.id(itemId);
    if (!item) throw new NotFoundException('Document not found');
    item.files.push({
      name: file.originalname,
      fileUrl: `/uploads/readiness/data-room/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      version: item.files.length + 1,
      uploadedBy: by,
      uploadedAt: new Date(),
    } as any);
    item.status = 'uploaded';
    item.updatedBy = by;
    item.updatedAt = new Date();
    this.log(
      ws,
      'upload',
      `${item.name} uploaded to the Data Room`,
      by,
      `${item.category} · v${item.files.length}`,
    );
    return this.persist(ws, true);
  }

  async removeRoomFile(
    tenantId: string,
    itemId: string,
    fileId: string,
    by: string,
  ) {
    const ws = await this.ensure(tenantId);
    const item = ws.room.id(itemId);
    if (!item) throw new NotFoundException('Document not found');
    const f = item.files.id(fileId);
    if (!f) throw new NotFoundException('File not found');
    f.deleteOne();
    if (
      item.files.length === 0 &&
      (item.status === 'uploaded' || item.status === 'review')
    ) {
      item.status = 'missing';
    }
    item.updatedBy = by;
    item.updatedAt = new Date();
    return this.persist(ws, true);
  }

  // Puts a generated readiness report into the data room itself, under
  // Deal Materials, so investors browsing the room find it alongside the
  // rest of the documents.
  async attachReport(
    tenantId: string,
    dto: AttachReportDto,
    businessName: string,
    by: string,
  ) {
    const pdf = await this.readiness.getReportPdf(
      tenantId,
      dto.assessmentId,
      businessName,
    );
    const dir = join(process.cwd(), 'uploads', 'readiness', 'data-room');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const filename = `${uuidv4()}.pdf`;
    writeFileSync(join(dir, filename), pdf);

    const ws = await this.ensure(tenantId);
    const name = 'Investor Readiness Report';
    let item = ws.room.find(
      (r) => r.category === 'Deal Materials' && r.name === name,
    );
    if (!item) {
      ws.room.push({
        category: 'Deal Materials',
        name,
        status: 'missing',
      } as any);
      item = ws.room[ws.room.length - 1];
    }
    item.files.push({
      name: `${name}.pdf`,
      fileUrl: `/uploads/readiness/data-room/${filename}`,
      mimeType: 'application/pdf',
      size: pdf.length,
      version: item.files.length + 1,
      uploadedBy: by,
      uploadedAt: new Date(),
    } as any);
    item.status = 'uploaded';
    item.updatedBy = by;
    item.updatedAt = new Date();
    this.log(
      ws,
      'upload',
      'Readiness report attached to the Data Room',
      by,
      `Deal Materials · v${item.files.length}`,
    );
    return this.persist(ws, true);
  }

  // ZIP of the data room as investors would see it: one folder per
  // category holding the newest file of each held document, an XLSX
  // index of the whole checklist, and (when asked for) the report PDF.
  async buildZip(
    tenantId: string,
    assessmentId: string | null,
    businessName: string,
  ): Promise<Buffer> {
    const ws = await this.ensure(tenantId);
    const room: any[] = ws.toObject().room;

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Data room index');
    sheet.columns = [
      { header: 'Category', key: 'category', width: 30 },
      { header: 'Document', key: 'name', width: 52 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Version', key: 'version', width: 9 },
      { header: 'File', key: 'file', width: 40 },
      { header: 'Uploaded by', key: 'by', width: 20 },
      { header: 'Updated', key: 'updated', width: 14 },
      { header: 'Expires', key: 'expires', width: 14 },
      { header: 'Note', key: 'note', width: 36 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const r of room) {
      const latest = r.files?.[r.files.length - 1];
      sheet.addRow({
        category: r.category,
        name: r.name,
        status: this.statusLabel(effectiveRoomStatus(r)),
        version: r.files?.length ?? 0,
        file: latest?.name ?? '',
        by: latest?.uploadedBy ?? '',
        updated: r.updatedAt
          ? new Date(r.updatedAt).toISOString().slice(0, 10)
          : '',
        expires: r.expiresAt
          ? new Date(r.expiresAt).toISOString().slice(0, 10)
          : '',
        note: r.note ?? '',
      });
    }
    const xlsx: Buffer = Buffer.from(await wb.xlsx.writeBuffer());

    let report: Buffer | null = null;
    if (assessmentId) {
      report = await this.readiness.getReportPdf(
        tenantId,
        assessmentId,
        businessName,
      );
    }

    const { ZipArchive } = require('archiver');
    return new Promise<Buffer>((resolve, reject) => {
      const archive = new ZipArchive({ zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      archive.on('data', (c: Buffer) => chunks.push(c));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      archive.append(xlsx, { name: 'Data room index.xlsx' });
      if (report)
        archive.append(report, { name: 'Investor Readiness Report.pdf' });
      const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-');
      for (const r of room) {
        const st = effectiveRoomStatus(r);
        if (st !== 'uploaded' && st !== 'review') continue;
        const latest = r.files?.[r.files.length - 1];
        if (!latest?.fileUrl) continue;
        const disk = join(process.cwd(), latest.fileUrl);
        if (existsSync(disk)) {
          archive.file(disk, {
            name: `${safe(r.category)}/${safe(latest.name)}`,
          });
        }
      }
      archive.finalize();
    });
  }

  // ── Sharing ──────────────────────────────────────────────────

  private heldCategories(ws: ReadinessWorkspaceDocument): string[] {
    const set = new Set<string>();
    for (const r of ws.room) {
      const st = effectiveRoomStatus(r);
      if ((st === 'uploaded' || st === 'review') && r.files.length)
        set.add(r.category);
    }
    return [...set];
  }

  private matchInvestor(
    ws: ReadinessWorkspaceDocument,
    investorId?: string,
    email?: string,
  ) {
    if (investorId && Types.ObjectId.isValid(investorId)) {
      const byId = ws.investors.id(investorId);
      if (byId) return byId;
    }
    if (email) {
      return ws.investors.find(
        (i) => i.email && i.email.toLowerCase() === email.toLowerCase(),
      );
    }
    return undefined;
  }

  private appUrl(): string {
    return (process.env.TENANT_APP_URL || '').replace(/\/$/, '');
  }

  async createShare(
    tenantId: string,
    dto: CreateShareDto,
    businessName: string,
    by: string,
  ) {
    const ws = await this.ensure(tenantId);
    const held = this.heldCategories(ws);
    if (!held.length) {
      throw new BadRequestException(
        'The data room has no uploaded documents to share yet.',
      );
    }
    const categories = (dto.categories?.length ? dto.categories : held).filter(
      (c) => held.includes(c),
    );
    if (!categories.length) {
      throw new BadRequestException(
        'None of the chosen categories holds an uploaded document.',
      );
    }
    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + (dto.expiryDays ?? 30) * 86400000);
    if (expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('The expiry must be in the future.');
    }
    const investor = this.matchInvestor(ws, dto.investorId, dto.email);

    ws.shares.push({
      token: randomBytes(24).toString('hex'),
      kind: 'room',
      investorName: dto.investorName,
      organisation: dto.organisation ?? investor?.organisation ?? '',
      email: dto.email.toLowerCase(),
      investorId: investor?._id ?? null,
      accessLevel: dto.accessLevel ?? 'view',
      categories,
      nda: dto.nda ?? 'none',
      // An NDA already on file is the tenant's say-so.
      ndaAcceptedAt: dto.nda === 'on_file' ? new Date() : null,
      ndaAcceptedBy: dto.nda === 'on_file' ? by : '',
      message: dto.message ?? '',
      expiresAt,
      status: 'active',
      sentAt: new Date(),
      sentBy: by,
    } as any);
    const share: any = ws.shares[ws.shares.length - 1];
    this.shareLog(
      ws,
      share,
      'sent',
      `${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} · ${share.accessLevel === 'download' ? 'view and download' : 'view only'}`,
    );
    this.log(
      ws,
      'send',
      `Data room shared with ${share.investorName}`,
      by,
      `${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} · ${share.accessLevel === 'download' ? 'View and download' : 'View only'} · Expires ${expiresAt.toISOString().slice(0, 10)}`,
    );
    if (investor) investor.lastContact = new Date();

    let emailSent = true;
    try {
      let attachments: { filename: string; content: Buffer }[] | undefined;
      if (dto.includeReport) {
        const latest = await this.assessmentModel
          .findOne({ tenantId: new Types.ObjectId(tenantId) })
          .sort({ version: -1 })
          .select('_id');
        if (latest) {
          attachments = [
            {
              filename: 'Investor Readiness Report.pdf',
              content: await this.readiness.getReportPdf(
                tenantId,
                String(latest._id),
                businessName,
              ),
            },
          ];
        }
      }
      await this.emailService.sendReadinessShare(
        {
          to: share.email,
          recipientName: share.investorName,
          businessName,
          kind: 'room',
          link: `${this.appUrl()}/readiness/share/${share.token}`,
          message: share.message,
          expiresOn: expiresAt.toISOString().slice(0, 10),
          accessLevel: share.accessLevel,
          ndaRequired: share.nda === 'click',
        },
        attachments,
      );
    } catch (e: any) {
      emailSent = false;
      this.logger.warn(`Readiness share email failed: ${e?.message}`);
    }
    const out = await this.persist(ws);
    return { ...out, emailSent, shareId: String(share._id) };
  }

  async sendReport(
    tenantId: string,
    dto: SendReportDto,
    businessName: string,
    by: string,
  ) {
    const pdf = await this.readiness.getReportPdf(
      tenantId,
      dto.assessmentId,
      businessName,
    );
    const ws = await this.ensure(tenantId);
    const investor = this.matchInvestor(ws, dto.investorId, dto.email);
    ws.shares.push({
      token: randomBytes(24).toString('hex'),
      kind: 'report',
      investorName: dto.investorName,
      organisation: dto.organisation ?? investor?.organisation ?? '',
      email: dto.email.toLowerCase(),
      investorId: investor?._id ?? null,
      accessLevel: 'download',
      categories: [],
      nda: 'none',
      message: dto.message ?? '',
      expiresAt: new Date(Date.now() + 365 * 86400000),
      status: 'active',
      sentAt: new Date(),
      sentBy: by,
    } as any);
    const share: any = ws.shares[ws.shares.length - 1];
    this.shareLog(ws, share, 'sent', 'Investor Readiness Report (PDF)');
    this.log(
      ws,
      'send',
      `Report sent to ${share.investorName}`,
      by,
      `PDF · ${share.organisation || share.email}`,
    );
    if (investor) investor.lastContact = new Date();

    let emailSent = true;
    try {
      await this.emailService.sendReadinessShare(
        {
          to: share.email,
          recipientName: share.investorName,
          businessName,
          kind: 'report',
          message: share.message,
        },
        [{ filename: 'Investor Readiness Report.pdf', content: pdf }],
      );
    } catch (e: any) {
      emailSent = false;
      this.logger.warn(`Readiness report email failed: ${e?.message}`);
    }
    const out = await this.persist(ws);
    return { ...out, emailSent };
  }

  async resendShare(
    tenantId: string,
    shareId: string,
    businessName: string,
    by: string,
  ) {
    const ws = await this.ensure(tenantId);
    const share: any = ws.shares.id(shareId);
    if (!share) throw new NotFoundException('Share not found');
    if (share.kind !== 'room') {
      throw new BadRequestException(
        'Only data room links can be resent — send the report again instead.',
      );
    }
    if (this.shareState(share) !== 'active') {
      throw new BadRequestException(
        `This link is ${this.shareState(share)} and cannot be resent.`,
      );
    }
    let emailSent = true;
    try {
      await this.emailService.sendReadinessShare({
        to: share.email,
        recipientName: share.investorName,
        businessName,
        kind: 'room',
        link: `${this.appUrl()}/readiness/share/${share.token}`,
        message: share.message,
        expiresOn: new Date(share.expiresAt).toISOString().slice(0, 10),
        accessLevel: share.accessLevel,
        ndaRequired: share.nda === 'click' && !share.ndaAcceptedAt,
      });
    } catch (e: any) {
      emailSent = false;
      this.logger.warn(`Readiness share resend failed: ${e?.message}`);
    }
    this.shareLog(
      ws,
      share,
      'resent',
      emailSent ? '' : 'Email could not be delivered',
    );
    this.log(ws, 'send', `Data room link resent to ${share.investorName}`, by);
    const out = await this.persist(ws);
    return { ...out, emailSent };
  }

  async revokeShare(tenantId: string, shareId: string, by: string) {
    const ws = await this.ensure(tenantId);
    const share: any = ws.shares.id(shareId);
    if (!share) throw new NotFoundException('Share not found');
    if (share.status === 'revoked') return this.view(ws);
    share.status = 'revoked';
    this.shareLog(ws, share, 'revoked');
    this.log(ws, 'send', `Access revoked for ${share.investorName}`, by);
    return this.persist(ws);
  }

  // ── Public, token-gated investor view (no login) ─────────────

  private async shareByToken(token: string) {
    if (!token || token.length < 20)
      throw new NotFoundException('Link not found');
    const ws = await this.model.findOne({ 'shares.token': token });
    if (!ws) throw new NotFoundException('Link not found');
    const share: any = ws.shares.find((s) => s.token === token);
    if (!share || share.kind !== 'room')
      throw new NotFoundException('Link not found');
    return { ws, share };
  }

  private ndaCleared(share: any): boolean {
    return share.nda !== 'click' || !!share.ndaAcceptedAt;
  }

  private publicContent(ws: ReadinessWorkspaceDocument, share: any) {
    const out: any[] = [];
    for (const category of share.categories) {
      const items = ws.room
        .filter((r) => r.category === category)
        .filter((r) => {
          const st = effectiveRoomStatus(r);
          return (st === 'uploaded' || st === 'review') && r.files.length;
        })
        .map((r) => {
          const f: any = r.files[r.files.length - 1];
          return {
            name: r.name,
            version: r.files.length,
            file: {
              id: String(f._id),
              name: f.name,
              size: f.size,
              mimeType: f.mimeType,
              uploadedAt: f.uploadedAt,
              // View-only links open documents in the browser; the file
              // address is only handed out through the download endpoint
              // for download-level links.
              url: share.accessLevel === 'view' ? f.fileUrl : null,
            },
          };
        });
      if (items.length) out.push({ category, items });
    }
    return out;
  }

  async publicOpen(token: string) {
    const { ws, share } = await this.shareByToken(token);
    const businessName = await resolveBusinessName(
      this.userModel,
      String(ws.tenantId),
    );
    const state = this.shareState(share);
    const base = {
      company: businessName,
      investorName: share.investorName,
      message: share.message,
      accessLevel: share.accessLevel,
      nda: share.nda,
      ndaAccepted: !!share.ndaAcceptedAt,
      expiresAt: share.expiresAt,
      state,
    };
    if (state !== 'active') return { ...base, categories: [] };
    if (!this.ndaCleared(share)) return { ...base, categories: [] };

    // A fresh view is logged at most once every ten minutes, so reloading
    // the page doesn't inflate the investor's engagement numbers.
    const recent =
      share.lastViewedAt &&
      Date.now() - new Date(share.lastViewedAt).getTime() < 10 * 60000;
    if (!recent) {
      share.views = (share.views ?? 0) + 1;
      share.lastViewedAt = new Date();
      this.shareLog(ws, share, 'viewed');
      this.log(
        ws,
        'view',
        `${share.investorName} viewed the data room`,
        share.investorName,
        share.organisation,
      );
      await ws.save();
    }
    return { ...base, categories: this.publicContent(ws, share) };
  }

  async publicAcceptNda(token: string, dto: AcceptNdaDto) {
    const { ws, share } = await this.shareByToken(token);
    if (this.shareState(share) !== 'active') {
      throw new ForbiddenException('This link is no longer active.');
    }
    if (share.nda !== 'click') {
      throw new BadRequestException('This link does not require an agreement.');
    }
    if (!share.ndaAcceptedAt) {
      share.ndaAcceptedAt = new Date();
      share.ndaAcceptedBy = dto.name.trim();
      this.shareLog(
        ws,
        share,
        'nda_accepted',
        `Accepted by ${share.ndaAcceptedBy}`,
      );
      this.log(
        ws,
        'system',
        `NDA accepted by ${share.investorName}`,
        'System',
        'Click-through NDA',
      );
      const investor = this.matchInvestor(
        ws,
        share.investorId ? String(share.investorId) : undefined,
        share.email,
      );
      if (investor) {
        investor.ndaSignedAt = investor.ndaSignedAt ?? new Date();
        if (investor.stage === 'outreach') investor.stage = 'nda_signed';
      }
      await ws.save();
    }
    return this.publicOpen(token);
  }

  async publicDownload(token: string, dto: ShareDownloadDto) {
    const { ws, share } = await this.shareByToken(token);
    if (this.shareState(share) !== 'active') {
      throw new ForbiddenException('This link is no longer active.');
    }
    if (!this.ndaCleared(share)) {
      throw new ForbiddenException('Accept the agreement first.');
    }
    if (share.accessLevel !== 'download') {
      throw new ForbiddenException('This link is view-only.');
    }
    let found: any = null;
    let itemName = '';
    for (const r of ws.room) {
      if (!share.categories.includes(r.category)) continue;
      const f = r.files.id(dto.fileId);
      if (f) {
        found = f;
        itemName = r.name;
        break;
      }
    }
    if (!found) throw new NotFoundException('File not found');
    share.downloads = (share.downloads ?? 0) + 1;
    this.shareLog(ws, share, 'downloaded', itemName);
    this.log(
      ws,
      'view',
      `${share.investorName} downloaded ${itemName}`,
      share.investorName,
      share.organisation,
    );
    await ws.save();
    return { url: found.fileUrl, name: found.name };
  }

  // ── Investor pipeline ────────────────────────────────────────

  async createInvestor(tenantId: string, dto: CreateInvestorDto, by: string) {
    const ws = await this.ensure(tenantId);
    ws.investors.push({
      name: dto.name.trim(),
      organisation: dto.organisation ?? '',
      email: (dto.email ?? '').toLowerCase(),
      type: dto.type ?? 'VC',
      stage: dto.stage ?? 'outreach',
      interest: dto.interest ?? 'medium',
      ticketAmount: dto.ticketAmount ?? 0,
      ticketCurrency: dto.ticketCurrency ?? 'USD',
      notes: dto.notes ?? '',
    } as any);
    this.log(
      ws,
      'status',
      `${dto.name} added to the investor pipeline`,
      by,
      dto.organisation ?? '',
    );
    return this.persist(ws);
  }

  async updateInvestor(
    tenantId: string,
    id: string,
    dto: UpdateInvestorDto,
    by: string,
  ) {
    const ws = await this.ensure(tenantId);
    const inv = ws.investors.id(id);
    if (!inv) throw new NotFoundException('Investor not found');
    const before = inv.stage;
    for (const k of [
      'name',
      'organisation',
      'type',
      'interest',
      'ticketAmount',
      'ticketCurrency',
      'notes',
    ] as const) {
      if ((dto as any)[k] !== undefined) (inv as any)[k] = (dto as any)[k];
    }
    if (dto.email !== undefined) inv.email = dto.email.toLowerCase();
    if (dto.lastContact) inv.lastContact = new Date(dto.lastContact);
    if (dto.stage !== undefined) {
      inv.stage = dto.stage;
      if (dto.stage === 'nda_signed' && !inv.ndaSignedAt)
        inv.ndaSignedAt = new Date();
    }
    if (dto.stage !== undefined && dto.stage !== before) {
      this.log(
        ws,
        'status',
        `${inv.name} moved to ${this.stageLabel(dto.stage)}`,
        by,
        `${inv.organisation} · From ${this.stageLabel(before)}`,
      );
    }
    return this.persist(ws);
  }

  private stageLabel(key: string) {
    return PIPELINE_STAGES.find((s) => s.key === key)?.label ?? key;
  }

  async advanceInvestor(tenantId: string, id: string, by: string) {
    const ws = await this.ensure(tenantId);
    const inv = ws.investors.id(id);
    if (!inv) throw new NotFoundException('Investor not found');
    const idx = PIPELINE_STAGES.findIndex((s) => s.key === inv.stage);
    if (idx < 0 || idx >= PIPELINE_STAGES.length - 1) {
      throw new BadRequestException(
        'This investor is already at the final stage.',
      );
    }
    const from = inv.stage;
    inv.stage = PIPELINE_STAGES[idx + 1].key;
    inv.lastContact = new Date();
    if (inv.stage === 'nda_signed' && !inv.ndaSignedAt)
      inv.ndaSignedAt = new Date();
    this.log(
      ws,
      'status',
      `${inv.name} moved to ${this.stageLabel(inv.stage)}`,
      by,
      `${inv.organisation} · From ${this.stageLabel(from)}`,
    );
    return this.persist(ws);
  }

  async deleteInvestor(tenantId: string, id: string, by: string) {
    const ws = await this.ensure(tenantId);
    const inv = ws.investors.id(id);
    if (!inv) throw new NotFoundException('Investor not found');
    this.log(
      ws,
      'status',
      `${inv.name} removed from the investor pipeline`,
      by,
    );
    inv.deleteOne();
    return this.persist(ws);
  }

  // ── Investor Q&A ─────────────────────────────────────────────

  async createQuestion(tenantId: string, dto: CreateQuestionDto, by: string) {
    const ws = await this.ensure(tenantId);
    const investor = this.matchInvestor(ws, dto.investorId);
    const askedBy = investor?.name ?? dto.askedBy?.trim();
    if (!askedBy)
      throw new BadRequestException('Say which investor asked this.');
    ws.questions.push({
      question: dto.question.trim(),
      investorId: investor?._id ?? null,
      askedBy,
      organisation: investor?.organisation ?? dto.organisation ?? '',
      category: dto.category ?? 'General',
      priority: dto.priority ?? 'medium',
      assignee: dto.assignee ?? '',
      status: 'open',
      askedAt: new Date(),
      answer: null,
    } as any);
    this.log(
      ws,
      'status',
      `Question logged from ${askedBy}`,
      by,
      dto.question.slice(0, 80),
    );
    return this.persist(ws);
  }

  async updateQuestion(tenantId: string, id: string, dto: UpdateQuestionDto) {
    const ws = await this.ensure(tenantId);
    const q = ws.questions.id(id);
    if (!q) throw new NotFoundException('Question not found');
    if (dto.priority !== undefined) q.priority = dto.priority;
    if (dto.assignee !== undefined) q.assignee = dto.assignee;
    if (dto.category !== undefined) q.category = dto.category;
    return this.persist(ws);
  }

  // Saving an answer sends it for review; nothing is "answered" until
  // someone approves it.
  async draftAnswer(
    tenantId: string,
    id: string,
    dto: DraftAnswerDto,
    by: string,
  ) {
    const ws = await this.ensure(tenantId);
    const q = ws.questions.id(id);
    if (!q) throw new NotFoundException('Question not found');
    if (!dto.text.trim())
      throw new BadRequestException('The answer cannot be empty.');
    q.answer = {
      text: dto.text.trim(),
      by,
      at: new Date(),
      approved: false,
      approvedBy: '',
    } as any;
    q.status = 'pending_review';
    this.log(
      ws,
      'status',
      `Answer drafted for review: ${q.question.slice(0, 40)}…`,
      by,
    );
    return this.persist(ws);
  }

  async approveAnswer(tenantId: string, id: string, by: string) {
    const ws = await this.ensure(tenantId);
    const q = ws.questions.id(id);
    if (!q) throw new NotFoundException('Question not found');
    if (!q.answer?.text)
      throw new BadRequestException('There is no answer to approve.');
    q.answer.approved = true;
    q.answer.approvedBy = by;
    q.status = 'answered';
    this.log(
      ws,
      'status',
      `Q&A answer approved: ${q.question.slice(0, 40)}…`,
      by,
    );
    return this.persist(ws);
  }

  async reopenQuestion(tenantId: string, id: string, by: string) {
    const ws = await this.ensure(tenantId);
    const q = ws.questions.id(id);
    if (!q) throw new NotFoundException('Question not found');
    q.status = q.answer?.text ? 'pending_review' : 'open';
    if (q.answer) {
      q.answer.approved = false;
      q.answer.approvedBy = '';
    }
    this.log(ws, 'status', `Q&A reopened: ${q.question.slice(0, 40)}…`, by);
    return this.persist(ws);
  }

  async deleteQuestion(tenantId: string, id: string) {
    const ws = await this.ensure(tenantId);
    const q = ws.questions.id(id);
    if (!q) throw new NotFoundException('Question not found');
    q.deleteOne();
    return this.persist(ws);
  }

  // ── Remediation board ────────────────────────────────────────

  async createTask(tenantId: string, dto: CreateTaskDto, by: string) {
    const ws = await this.ensure(tenantId);
    ws.tasks.push({
      title: dto.title.trim(),
      dimension: dto.dimension ?? 'General',
      priority: dto.priority ?? 'P2',
      status: 'open',
      owner: dto.owner ?? '',
      due: dto.due ? new Date(dto.due) : null,
      description: dto.description ?? '',
    } as any);
    this.log(
      ws,
      'task',
      `New task created: ${dto.title}`,
      by,
      `${dto.dimension ?? 'General'} · ${dto.priority ?? 'P2'}${dto.owner ? ` · Assigned to ${dto.owner}` : ''}`,
    );
    return this.persist(ws);
  }

  async updateTask(
    tenantId: string,
    id: string,
    dto: UpdateTaskDto,
    by: string,
  ) {
    const ws = await this.ensure(tenantId);
    const t = ws.tasks.id(id);
    if (!t) throw new NotFoundException('Task not found');
    const before = t.status;
    for (const k of [
      'title',
      'dimension',
      'priority',
      'owner',
      'description',
    ] as const) {
      if ((dto as any)[k] !== undefined) (t as any)[k] = (dto as any)[k];
    }
    if (dto.due !== undefined) t.due = dto.due ? new Date(dto.due) : null;
    if (dto.status !== undefined) {
      t.status = dto.status;
      t.closedAt = dto.status === 'closed' ? new Date() : null;
    }
    if (dto.status !== undefined && dto.status !== before) {
      const label = {
        open: 'Open',
        in_progress: 'In Progress',
        review: 'Under Review',
        closed: 'Completed',
      } as any;
      this.log(
        ws,
        'task',
        dto.status === 'closed'
          ? `Task completed: ${t.title}`
          : `Task moved to ${label[dto.status]}: ${t.title}`,
        by,
        `${t.dimension} · ${t.priority}${t.due ? ` · Due ${t.due.toISOString().slice(0, 10)}` : ''}`,
      );
    }
    return this.persist(ws);
  }

  async addTaskComment(
    tenantId: string,
    id: string,
    dto: AddTaskCommentDto,
    by: string,
  ) {
    const ws = await this.ensure(tenantId);
    const t = ws.tasks.id(id);
    if (!t) throw new NotFoundException('Task not found');
    if (!dto.text.trim())
      throw new BadRequestException('The comment cannot be empty.');
    t.comments.push({ by, text: dto.text.trim(), at: new Date() } as any);
    return this.persist(ws);
  }

  async deleteTask(tenantId: string, id: string, by: string) {
    const ws = await this.ensure(tenantId);
    const t = ws.tasks.id(id);
    if (!t) throw new NotFoundException('Task not found');
    this.log(ws, 'task', `Task deleted: ${t.title}`, by);
    t.deleteOne();
    return this.persist(ws);
  }
}
