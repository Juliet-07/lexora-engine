import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DocumentFile, DocumentRecord, DocumentStatus } from './schemas/document.schema';
import { DocumentTemplate, DocumentTemplateDocument } from './schemas/document-template.schema';
import {
  UploadDocumentDto, UpdateDocumentDto, SendDocumentDto,
  UpdateDocumentStatusDto, CreateTemplateDto,
} from './dto/document.dto';
import { PaginationDto, paginate } from '../../common/pagination.dto';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(DocumentFile.name) private docModel: Model<DocumentRecord>,
    @InjectModel(DocumentTemplate.name) private templateModel: Model<DocumentTemplateDocument>,
  ) {}

  async uploadDocument(dto: UploadDocumentDto, organizationId: string, uploadedBy: string): Promise<DocumentRecord> {
    return this.docModel.create({
      ...dto,
      organizationId: new Types.ObjectId(organizationId),
      uploadedBy: new Types.ObjectId(uploadedBy),
      clientId: dto.clientId ? new Types.ObjectId(dto.clientId) : null,
      templateId: dto.templateId ? new Types.ObjectId(dto.templateId) : null,
    }) as any;
  }

  async findAll(organizationId: string, pagination: PaginationDto, clientId?: string) {
    const query: any = { organizationId: new Types.ObjectId(organizationId) };
    if (clientId) query.clientId = new Types.ObjectId(clientId);

    const { skip, limit, page } = pagination;
    const [data, total] = await Promise.all([
      this.docModel.find(query).skip(skip).limit(limit)
        .populate('uploadedBy', 'firstName lastName email')
        .populate('clientId', 'firstName lastName email')
        .lean(),
      this.docModel.countDocuments(query),
    ]);
    return paginate(data, total, page, limit);
  }

  async findById(id: string, organizationId: string): Promise<DocumentRecord> {
    const doc = await this.docModel.findOne({
      _id: id,
      organizationId: new Types.ObjectId(organizationId),
    }).populate('uploadedBy', 'firstName lastName email').lean();
    if (!doc) throw new NotFoundException('Document not found');
    return doc as DocumentRecord;
  }

  async updateDocument(id: string, dto: UpdateDocumentDto, organizationId: string): Promise<DocumentRecord> {
    const doc = await this.docModel.findOneAndUpdate(
      { _id: id, organizationId: new Types.ObjectId(organizationId) },
      dto,
      { new: true },
    );
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async sendDocumentToClient(id: string, dto: SendDocumentDto, organizationId: string): Promise<DocumentRecord> {
    const doc = await this.docModel.findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) });
    if (!doc) throw new NotFoundException('Document not found');
    if (!doc.requiresSignature) throw new BadRequestException('Document does not require signature');

    const signatories = dto.signatoryIds.map((uid) => ({
      userId: uid,
      name: '',
      email: '',
      signedAt: null,
      signatureUrl: null,
      status: 'pending',
    }));

    doc.signatories = signatories;
    doc.status = DocumentStatus.PENDING_SIGNATURE;
    doc.sentAt = new Date();
    if (dto.expiresAt) doc.expiresAt = new Date(dto.expiresAt);

    return doc.save() as any;
  }

  async trackSignature(docId: string, signatoryUserId: string, signatureUrl: string): Promise<DocumentRecord> {
    const doc = await this.docModel.findById(docId);
    if (!doc) throw new NotFoundException('Document not found');

    const signatory = doc.signatories.find((s) => s.userId === signatoryUserId);
    if (!signatory) throw new NotFoundException('Signatory not found on document');

    signatory.signedAt = new Date();
    signatory.signatureUrl = signatureUrl;
    signatory.status = 'signed';

    const allSigned = doc.signatories.every((s) => s.status === 'signed');
    if (allSigned) doc.status = DocumentStatus.SIGNED;

    return doc.save() as any;
  }

  async updateStatus(id: string, dto: UpdateDocumentStatusDto, organizationId: string): Promise<DocumentRecord> {
    const doc = await this.docModel.findOneAndUpdate(
      { _id: id, organizationId: new Types.ObjectId(organizationId) },
      { status: dto.status },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async deleteDocument(id: string, organizationId: string): Promise<void> {
    const doc = await this.docModel.findOneAndDelete({
      _id: id,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!doc) throw new NotFoundException('Document not found');
  }

  // Templates
  async createTemplate(dto: CreateTemplateDto, organizationId: string, createdBy: string): Promise<DocumentTemplateDocument> {
    return this.templateModel.create({
      ...dto,
      organizationId: new Types.ObjectId(organizationId),
      createdBy: new Types.ObjectId(createdBy),
    });
  }

  async getTemplates(organizationId: string): Promise<DocumentTemplateDocument[]> {
    return this.templateModel.find({ organizationId: new Types.ObjectId(organizationId), isActive: true }).lean() as any;
  }

  async getTemplateById(id: string): Promise<DocumentTemplateDocument> {
    const t = await this.templateModel.findById(id).lean();
    if (!t) throw new NotFoundException('Template not found');
    return t as DocumentTemplateDocument;
  }
}
