import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  MandateMessage,
  MandateMessageDocument,
  MessageDirection,
  MandateEmployeeMessage,
  MandateEmployeeMessageDocument,
  EmployeeMessageDirection,
  MandateNote,
  MandateNoteDocument,
  MandateDocumentEntry,
  MandateDocumentDocument,
  ClientDocStatus,
  DEFAULT_MANDATE_FOLDERS,
  MandateEmployeeThreadRead,
  MandateEmployeeThreadReadDocument,
} from '../schemas';
import { MandateService } from './mandate.service';
import {
  CreateMessageDto,
  CreateEmployeeMessageDto,
  CreateNoteDto,
} from '../dtos';
import {
  Employee,
  EmployeeDocument,
} from '../../../hr/schemas/employee.schema';

@Injectable()
export class MandateWorkspaceService {
  constructor(
    @InjectModel(MandateMessage.name)
    private readonly messageModel: Model<MandateMessageDocument>,
    @InjectModel(MandateEmployeeMessage.name)
    private readonly employeeMessageModel: Model<MandateEmployeeMessageDocument>,
    @InjectModel(MandateNote.name)
    private readonly noteModel: Model<MandateNoteDocument>,
    @InjectModel(MandateDocumentEntry.name)
    private readonly documentModel: Model<MandateDocumentDocument>,
    @InjectModel(MandateEmployeeThreadRead.name)
    private readonly threadReadModel: Model<MandateEmployeeThreadReadDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly mandateService: MandateService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Messages ─────────────────────────────────────────────────

  async getMessages(tenantId: string, mandateId: string) {
    return this.messageModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        mandateId: new Types.ObjectId(mandateId),
      })
      .sort({ createdAt: 1 })
      .lean();
  }

  async addMessage(
    tenantId: string,
    mandateId: string,
    direction: MessageDirection,
    dto: CreateMessageDto,
  ) {
    const created = await this.messageModel.create({
      tenantId: new Types.ObjectId(tenantId),
      mandateId: new Types.ObjectId(mandateId),
      direction,
      author: dto.author,
      body: dto.body,
    });
    return created.toObject();
  }

  // ── Messages (tenant ↔ a specific employee) ─────────────────────
  // Same shape as the client thread above, but scoped to one
  // employee per mandate rather than the client. `direction` is
  // passed in by the caller (controller decides tenant vs employee),
  // never taken from client input.

  async getEmployeeMessages(
    tenantId: string,
    mandateId: string,
    employeeUserId: string,
  ) {
    return this.employeeMessageModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        mandateId: new Types.ObjectId(mandateId),
        employeeUserId: new Types.ObjectId(employeeUserId),
      })
      .sort({ createdAt: 1 })
      .lean();
  }

  async addEmployeeMessage(
    tenantId: string,
    mandateId: string,
    employeeUserId: string,
    direction: EmployeeMessageDirection,
    dto: CreateEmployeeMessageDto,
  ) {
    const created = await this.employeeMessageModel.create({
      tenantId: new Types.ObjectId(tenantId),
      mandateId: new Types.ObjectId(mandateId),
      employeeUserId: new Types.ObjectId(employeeUserId),
      direction,
      author: dto.author,
      body: dto.body,
    });

    const mandate = await this.mandateService
      .getById(tenantId, mandateId)
      .catch(() => null);
    const mandateName = (mandate as any)?.name ?? 'a mandate';

    if (direction === EmployeeMessageDirection.TENANT) {
      // employeeUserId here is the Employee record's own _id (how
      // this thread has always been keyed), not their linked User
      // account — resolve the real User._id before notifying, since
      // TenantNotification.recipientUserId must be a real user.
      const employee = await this.employeeModel
        .findById(employeeUserId)
        .select('userId')
        .lean();
      if (employee?.userId) {
        this.eventEmitter.emit('employee.mandate_message.received', {
          tenantId,
          employeeUserId: String(employee.userId),
          mandateId,
          mandateName,
          author: dto.author,
        });
      }
    } else {
      // Employee sent it — the tenant is notified.
      this.eventEmitter.emit('tenant.mandate_message.received', {
        tenantId,
        mandateId,
        mandateName,
        author: dto.author,
      });
    }

    return created.toObject();
  }

  // ═══════════════════════════════════════════════════════════
  // READ-TRACKING — real unread state per (mandate, employee)
  // thread, for both directions.
  // ═══════════════════════════════════════════════════════════

  private async unreadCountsFor(
    tenantId: string,
    mandateId: string,
    direction: EmployeeMessageDirection,
    cutoffByEmployeeId: Map<string, Date | null>,
  ) {
    const counts: Record<string, number> = {};
    await Promise.all(
      Array.from(cutoffByEmployeeId.entries()).map(
        async ([employeeUserId, cutoff]) => {
          counts[employeeUserId] =
            await this.employeeMessageModel.countDocuments({
              tenantId: new Types.ObjectId(tenantId),
              mandateId: new Types.ObjectId(mandateId),
              employeeUserId: new Types.ObjectId(employeeUserId),
              direction,
              createdAt: cutoff ? { $gt: cutoff } : { $exists: true },
            });
        },
      ),
    );
    return counts;
  }

  // Tenant-side: unread count per employee thread on this mandate —
  // one query per thread the tenant has actually messaged with, not
  // a scan of every employee that ever existed.
  async getEmployeeThreadUnreadSummary(tenantId: string, mandateId: string) {
    const employeeIds = await this.employeeMessageModel.distinct(
      'employeeUserId',
      {
        tenantId: new Types.ObjectId(tenantId),
        mandateId: new Types.ObjectId(mandateId),
      },
    );
    if (!employeeIds.length) return {};

    const reads = await this.threadReadModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        mandateId: new Types.ObjectId(mandateId),
        employeeUserId: { $in: employeeIds },
      })
      .lean();
    const readByEmployee = new Map(
      reads.map((r) => [String(r.employeeUserId), r.lastReadByTenantAt]),
    );
    const cutoffByEmployeeId = new Map(
      employeeIds.map((id) => [
        String(id),
        readByEmployee.get(String(id)) ?? null,
      ]),
    );

    return this.unreadCountsFor(
      tenantId,
      mandateId,
      EmployeeMessageDirection.EMPLOYEE,
      cutoffByEmployeeId,
    );
  }

  async markEmployeeThreadReadByTenant(
    tenantId: string,
    mandateId: string,
    employeeUserId: string,
  ) {
    await this.threadReadModel.updateOne(
      {
        tenantId: new Types.ObjectId(tenantId),
        mandateId: new Types.ObjectId(mandateId),
        employeeUserId: new Types.ObjectId(employeeUserId),
      },
      { $set: { lastReadByTenantAt: new Date() } },
      { upsert: true },
    );
    return { success: true };
  }

  // Employee-side: unread count for their own thread on this
  // mandate.
  async getMyThreadUnreadCount(
    tenantId: string,
    mandateId: string,
    employeeUserId: string,
  ) {
    const read = await this.threadReadModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        mandateId: new Types.ObjectId(mandateId),
        employeeUserId: new Types.ObjectId(employeeUserId),
      })
      .lean();
    return this.employeeMessageModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
      mandateId: new Types.ObjectId(mandateId),
      employeeUserId: new Types.ObjectId(employeeUserId),
      direction: EmployeeMessageDirection.TENANT,
      createdAt: read?.lastReadByEmployeeAt
        ? { $gt: read.lastReadByEmployeeAt }
        : { $exists: true },
    });
  }

  async markMyThreadRead(
    tenantId: string,
    mandateId: string,
    employeeUserId: string,
  ) {
    await this.threadReadModel.updateOne(
      {
        tenantId: new Types.ObjectId(tenantId),
        mandateId: new Types.ObjectId(mandateId),
        employeeUserId: new Types.ObjectId(employeeUserId),
      },
      { $set: { lastReadByEmployeeAt: new Date() } },
      { upsert: true },
    );
    return { success: true };
  }

  // ── Notes ────────────────────────────────────────────────────

  async getNotes(tenantId: string, mandateId: string) {
    return this.noteModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        mandateId: new Types.ObjectId(mandateId),
      })
      .sort({ createdAt: -1 })
      .lean();
  }

  async addNote(tenantId: string, mandateId: string, dto: CreateNoteDto) {
    const created = await this.noteModel.create({
      tenantId: new Types.ObjectId(tenantId),
      mandateId: new Types.ObjectId(mandateId),
      author: dto.author,
      body: dto.body,
    });
    return created.toObject();
  }

  async deleteNote(tenantId: string, mandateId: string, noteId: string) {
    const res = await this.noteModel.deleteOne({
      _id: noteId,
      tenantId: new Types.ObjectId(tenantId),
      mandateId: new Types.ObjectId(mandateId),
    });
    if (!res.deletedCount) throw new NotFoundException('Note not found');
    return { deleted: true };
  }

  // ── Documents & folders ──────────────────────────────────────

  async getFolders(tenantId: string, mandateId: string) {
    const tId = new Types.ObjectId(tenantId);
    const mId = new Types.ObjectId(mandateId);
    const [mandate, docFolders] = await Promise.all([
      this.mandateService.getById(tenantId, mandateId),
      this.documentModel.distinct('folder', { tenantId: tId, mandateId: mId }),
    ]);
    return Array.from(
      new Set([
        ...DEFAULT_MANDATE_FOLDERS,
        ...(mandate as any).customFolders,
        ...docFolders,
      ]),
    );
  }

  async addFolder(tenantId: string, mandateId: string, folder: string) {
    await this.mandateService.addCustomFolder(tenantId, mandateId, folder);
    return this.getFolders(tenantId, mandateId);
  }

  async getDocuments(tenantId: string, mandateId: string, folder?: string) {
    const query: any = {
      tenantId: new Types.ObjectId(tenantId),
      mandateId: new Types.ObjectId(mandateId),
    };
    if (folder) query.folder = folder;
    // Documents still pending client filing don't show up in their
    // folder listing until accepted — matches the confirmed
    // prototype's filesIn() exclusion exactly.
    query.$or = [
      { fromClient: { $ne: true } },
      { status: { $ne: ClientDocStatus.PENDING } },
    ];
    return this.documentModel.find(query).sort({ createdAt: -1 }).lean();
  }

  async getReceivedFromClient(tenantId: string, mandateId: string) {
    return this.documentModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        mandateId: new Types.ObjectId(mandateId),
        fromClient: true,
        status: ClientDocStatus.PENDING,
      })
      .sort({ createdAt: -1 })
      .lean();
  }

  async uploadDocument(
    tenantId: string,
    mandateId: string,
    folder: string,
    uploadedBy: string,
    file: Express.Multer.File,
    fromClient = false,
  ) {
    const created = await this.documentModel.create({
      tenantId: new Types.ObjectId(tenantId),
      mandateId: new Types.ObjectId(mandateId),
      folder,
      name: file.originalname,
      fileUrl: `/uploads/crm/mandates/${file.filename}`,
      size: file.size,
      mimeType: file.mimetype,
      uploadedBy,
      fromClient,
      // A client upload lands as pending until the tenant accepts &
      // files it — matches how the tenant-side "received from
      // client" inbox already expects a document to arrive.
      status: fromClient ? ClientDocStatus.PENDING : null,
    });
    return created.toObject();
  }

  async fileClientDocument(
    tenantId: string,
    mandateId: string,
    documentId: string,
    folder: string,
  ) {
    const doc = await this.documentModel.findOneAndUpdate(
      {
        _id: documentId,
        tenantId: new Types.ObjectId(tenantId),
        mandateId: new Types.ObjectId(mandateId),
      },
      { $set: { folder, status: ClientDocStatus.FILED } },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Document not found');
    return doc.toObject();
  }
}
