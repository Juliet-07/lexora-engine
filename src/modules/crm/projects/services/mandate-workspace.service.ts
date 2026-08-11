import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  MandateMessage,
  MandateMessageDocument,
  MessageDirection,
  MandateNote,
  MandateNoteDocument,
  MandateDocumentEntry,
  MandateDocumentDocument,
  ClientDocStatus,
  DEFAULT_MANDATE_FOLDERS,
} from '../schemas';
import { MandateService } from './mandate.service';
import { CreateMessageDto, CreateNoteDto } from '../dtos';

@Injectable()
export class MandateWorkspaceService {
  constructor(
    @InjectModel(MandateMessage.name)
    private readonly messageModel: Model<MandateMessageDocument>,
    @InjectModel(MandateNote.name)
    private readonly noteModel: Model<MandateNoteDocument>,
    @InjectModel(MandateDocumentEntry.name)
    private readonly documentModel: Model<MandateDocumentDocument>,
    private readonly mandateService: MandateService,
  ) {}

  // ── Messages ─────────────────────────────────────────────────

  async getMessages(tenantId: string, mandateId: string) {
    return this.messageModel
      .find({ tenantId: new Types.ObjectId(tenantId), mandateId })
      .sort({ createdAt: 1 })
      .lean();
  }

  async addMessage(tenantId: string, mandateId: string, dto: CreateMessageDto) {
    const created = await this.messageModel.create({
      tenantId: new Types.ObjectId(tenantId),
      mandateId,
      direction: MessageDirection.TENANT,
      author: dto.author,
      body: dto.body,
    });
    return created.toObject();
  }

  // ── Notes ────────────────────────────────────────────────────

  async getNotes(tenantId: string, mandateId: string) {
    return this.noteModel
      .find({ tenantId: new Types.ObjectId(tenantId), mandateId })
      .sort({ createdAt: -1 })
      .lean();
  }

  async addNote(tenantId: string, mandateId: string, dto: CreateNoteDto) {
    const created = await this.noteModel.create({
      tenantId: new Types.ObjectId(tenantId),
      mandateId,
      author: dto.author,
      body: dto.body,
    });
    return created.toObject();
  }

  async deleteNote(tenantId: string, mandateId: string, noteId: string) {
    const res = await this.noteModel.deleteOne({
      _id: noteId,
      tenantId: new Types.ObjectId(tenantId),
      mandateId,
    });
    if (!res.deletedCount) throw new NotFoundException('Note not found');
    return { deleted: true };
  }

  // ── Documents & folders ──────────────────────────────────────

  async getFolders(tenantId: string, mandateId: string) {
    const tId = new Types.ObjectId(tenantId);
    const [mandate, docFolders] = await Promise.all([
      this.mandateService.getById(tenantId, mandateId),
      this.documentModel.distinct('folder', { tenantId: tId, mandateId }),
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
    const query: any = { tenantId: new Types.ObjectId(tenantId), mandateId };
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
        mandateId,
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
  ) {
    const created = await this.documentModel.create({
      tenantId: new Types.ObjectId(tenantId),
      mandateId,
      folder,
      name: file.originalname,
      fileUrl: `/uploads/crm/mandates/${file.filename}`,
      size: file.size,
      mimeType: file.mimetype,
      uploadedBy,
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
        mandateId,
      },
      { $set: { folder, status: ClientDocStatus.FILED } },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Document not found');
    return doc.toObject();
  }
}
