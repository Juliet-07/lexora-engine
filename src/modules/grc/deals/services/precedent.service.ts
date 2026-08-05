import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as mammoth from 'mammoth';
import {
  Precedent,
  PrecedentDocument,
  PrecedentFolder,
  PrecedentFolderDocument,
} from '../schemas';
import { CreatePrecedentDto, UpdatePrecedentContentDto } from '../dtos';

@Injectable()
export class PrecedentService {
  constructor(
    @InjectModel(Precedent.name)
    private readonly model: Model<PrecedentDocument>,
    @InjectModel(PrecedentFolder.name)
    private readonly folderModel: Model<PrecedentFolderDocument>,
  ) {}

  private async extractHtml(diskPath: string): Promise<string> {
    const result = await mammoth.convertToHtml({ path: diskPath });
    return result.value;
  }

  async createFolder(tenantId: string, dto: { name: string }) {
    return this.folderModel.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
    });
  }

  async getFolders(tenantId: string) {
    return this.folderModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ name: 1 })
      .lean();
  }

  async deleteFolder(tenantId: string, folderId: string) {
    const tId = new Types.ObjectId(tenantId);
    const folder = await this.folderModel.findOne({
      _id: folderId,
      tenantId: tId,
    });
    if (!folder) throw new NotFoundException('Folder not found');
    await this.model.deleteMany({ tenantId: tId, folderId: folder._id });
    await this.folderModel.deleteOne({ _id: folder._id });
    return { success: true };
  }

  async create(
    tenantId: string,
    dto: CreatePrecedentDto,
    file: Express.Multer.File,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const folder = await this.folderModel
      .findOne({ _id: dto.folderId, tenantId: tId })
      .lean();
    if (!folder) throw new NotFoundException('Folder not found');

    const content = await this.extractHtml(file.path);
    return this.model.create({
      tenantId: tId,
      folderId: folder._id,
      name: dto.name,
      type: dto.type,
      jurisdiction: dto.jurisdiction ?? 'Rwanda',
      fileName: file.originalname,
      fileUrl: `/uploads/deals/precedents/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      content,
    });
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ name: 1 })
      .lean();
  }

  async getById(tenantId: string, id: string) {
    const p = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!p) throw new NotFoundException('Precedent not found');
    return p;
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<PrecedentDocument> {
    const p = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!p) throw new NotFoundException('Precedent not found');
    return p;
  }

  async updateContent(
    tenantId: string,
    id: string,
    dto: UpdatePrecedentContentDto,
  ) {
    const p = await this.getRawDoc(tenantId, id);
    p.content = dto.content;
    await p.save();
    return p;
  }

  // Overwrites the source file AND re-extracts content from it —
  // any manual edits since the last upload are discarded. The
  // frontend confirms this destructively before calling it.
  async replaceDocument(
    tenantId: string,
    id: string,
    file: Express.Multer.File,
  ) {
    const p = await this.getRawDoc(tenantId, id);
    const content = await this.extractHtml(file.path);
    p.fileName = file.originalname;
    p.fileUrl = `/uploads/deals/precedents/${file.filename}`;
    p.mimeType = file.mimetype;
    p.size = file.size;
    p.content = content;
    await p.save();
    return p;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.model.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Precedent not found');
  }
}
