import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import { join } from 'path';
import {
  EmployeeDocumentFile,
  EmployeeDocumentFileDocument,
  DocumentUploader,
} from '../schemas/employee-document.schema';

@Injectable()
export class EmployeeDocumentService {
  constructor(
    @InjectModel(EmployeeDocumentFile.name)
    private readonly docModel: Model<EmployeeDocumentFileDocument>,
  ) {}

  // Shared — used by both tenant and employee read paths.
  async getForEmployee(
    tenantId: string,
    employeeId: string,
  ): Promise<EmployeeDocumentFileDocument[]> {
    return this.docModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        employeeId: new Types.ObjectId(employeeId),
      })
      .sort({ createdAt: -1 })
      .lean() as any;
  }

  // ── TENANT-SIDE ──

  async uploadAsTenant(
    tenantId: string,
    employeeId: string,
    tenantUserId: string,
    file: Express.Multer.File,
    label?: string,
  ): Promise<EmployeeDocumentFileDocument> {
    return this.docModel.create({
      tenantId: new Types.ObjectId(tenantId),
      employeeId: new Types.ObjectId(employeeId),
      fileName: file.originalname,
      label: label ?? null,
      fileUrl: `/uploads/employee/documents/${file.filename}`,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedBy: DocumentUploader.TENANT,
      uploadedByUserId: new Types.ObjectId(tenantUserId),
    });
  }

  async deleteAsTenant(tenantId: string, documentId: string): Promise<void> {
    const doc = await this.docModel.findOne({
      _id: documentId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!doc) throw new NotFoundException('Document not found');
    this.removeFileFromDisk(doc.fileUrl);
    await this.docModel.deleteOne({ _id: documentId });
  }

  // ── EMPLOYEE-SIDE — can only ever act on their OWN documents,
  // and only ones THEY uploaded (never delete something the tenant
  // placed on their file) ──

  async uploadAsEmployee(
    tenantId: string,
    employeeId: string,
    employeeUserId: string,
    file: Express.Multer.File,
    label?: string,
  ): Promise<EmployeeDocumentFileDocument> {
    return this.docModel.create({
      tenantId: new Types.ObjectId(tenantId),
      employeeId: new Types.ObjectId(employeeId),
      fileName: file.originalname,
      label: label ?? null,
      fileUrl: `/uploads/employee/documents/${file.filename}`,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedBy: DocumentUploader.EMPLOYEE,
      uploadedByUserId: new Types.ObjectId(employeeUserId),
    });
  }

  async getMyDocuments(
    tenantId: string,
    employeeId: string,
  ): Promise<EmployeeDocumentFileDocument[]> {
    return this.getForEmployee(tenantId, employeeId);
  }

  async deleteAsEmployee(
    employeeId: string,
    documentId: string,
  ): Promise<void> {
    const doc = await this.docModel.findOne({
      _id: documentId,
      employeeId: new Types.ObjectId(employeeId),
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.uploadedBy !== DocumentUploader.EMPLOYEE) {
      throw new ForbiddenException(
        'You can only remove documents you uploaded yourself.',
      );
    }
    this.removeFileFromDisk(doc.fileUrl);
    await this.docModel.deleteOne({ _id: documentId });
  }

  private removeFileFromDisk(fileUrl: string): void {
    // fileUrl is stored as "/uploads/employee/documents/<name>" —
    // strip the leading "/uploads/" since process.cwd() + 'uploads'
    // is the real base, matching the static-assets setup in main.ts.
    try {
      const relative = fileUrl.replace(/^\/uploads\//, '');
      const fullPath = join(process.cwd(), 'uploads', relative);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (err) {
      console.error(`Failed to remove file from disk: ${fileUrl}`, err);
    }
  }
}
