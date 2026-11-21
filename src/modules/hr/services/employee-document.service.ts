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
  Employee,
  EmployeeDocument as EmployeeEntityDocument,
} from '../schemas/employee.schema';
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
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeEntityDocument>,
  ) {}

  private static readonly ONBOARDING_PREFIX = 'onboarding-cert-';

  private guessMime(name: string): string {
    const ext = (name.split('.').pop() ?? '').toLowerCase();
    const map: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return map[ext] ?? 'application/octet-stream';
  }

  private assertNotOnboardingDoc(documentId: string): void {
    if (documentId.startsWith(EmployeeDocumentService.ONBOARDING_PREFIX)) {
      throw new ForbiddenException(
        'Certificates submitted during onboarding cannot be removed here.',
      );
    }
  }

  // Shared — used by both tenant and employee read paths.
  // Certificates uploaded during onboarding live on the Employee record;
  // they are surfaced here as read-only entries so the employee and the
  // tenant see ONE complete document list.
  async getForEmployee(
    tenantId: string,
    employeeId: string,
  ): Promise<EmployeeDocumentFileDocument[]> {
    const tenantOid = new Types.ObjectId(tenantId);
    const employeeOid = new Types.ObjectId(employeeId);

    const [docs, employee] = await Promise.all([
      this.docModel
        .find({ tenantId: tenantOid, employeeId: employeeOid })
        .sort({ createdAt: -1 })
        .lean(),
      this.employeeModel
        .findOne({ _id: employeeOid, tenantId: tenantOid })
        .select('certificates')
        .lean(),
    ]);

    const onboarding = ((employee as any)?.certificates ?? []).map(
      (c: any, i: number) => {
        const fileName = c.originalFileName || c.name;
        const stored =
          String(c.fileUrl ?? '')
            .split('/')
            .pop() ?? String(i);
        return {
          _id: `${EmployeeDocumentService.ONBOARDING_PREFIX}${stored}`,
          tenantId: tenantOid,
          employeeId: employeeOid,
          fileName,
          label: c.name ?? null,
          fileUrl: c.fileUrl,
          mimeType: this.guessMime(fileName),
          sizeBytes: null,
          uploadedBy: DocumentUploader.EMPLOYEE,
          source: 'onboarding',
          createdAt: c.uploadedAt ?? null,
        };
      },
    );

    return [...docs, ...onboarding].sort(
      (a: any, b: any) =>
        new Date(b.createdAt ?? 0).getTime() -
        new Date(a.createdAt ?? 0).getTime(),
    ) as any;
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
    this.assertNotOnboardingDoc(documentId);
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
    this.assertNotOnboardingDoc(documentId);
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
