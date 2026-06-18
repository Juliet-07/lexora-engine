import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';

import {
  OnboardingDocument,
  OnboardingDocumentDocument,
  OnboardingDocType,
  EmployeeOnboarding,
  EmployeeOnboardingDocument,
  Employee,
  EmployeeDocument,
} from '../schemas';
import {
  CreateOnboardingDocumentDto,
  UpdateOnboardingDocumentDto,
  CompleteOnboardingDto,
} from '../dtos';

@Injectable()
export class OnboardingService {
  constructor(
    @InjectModel(OnboardingDocument.name)
    private readonly docModel: Model<OnboardingDocumentDocument>,
    @InjectModel(EmployeeOnboarding.name)
    private readonly ackModel: Model<EmployeeOnboardingDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // TENANT — manage onboarding documents
  // ═══════════════════════════════════════════════════════════

  async createDocument(
    tenantId: string,
    dto: CreateOnboardingDocumentDto,
    file?: Express.Multer.File,
  ): Promise<OnboardingDocumentDocument> {
    if (dto.type === OnboardingDocType.TEXT && !dto.content?.trim()) {
      throw new BadRequestException(
        'Content is required for a text-type onboarding document.',
      );
    }
    if (dto.type === OnboardingDocType.PDF && !file) {
      throw new BadRequestException(
        'A PDF file is required for a pdf-type onboarding document.',
      );
    }

    const tId = new Types.ObjectId(tenantId);

    // Default new documents to the end of the order list
    let order = dto.order;
    if (order === undefined) {
      const count = await this.docModel.countDocuments({ tenantId: tId });
      order = count;
    }

    return this.docModel.create({
      tenantId: tId,
      title: dto.title,
      type: dto.type,
      content: dto.type === OnboardingDocType.TEXT ? dto.content : null,
      fileUrl: file ? this.buildFileUrl(file.filename) : null,
      originalFileName: file?.originalname ?? null,
      order,
      isActive: true,
    });
  }

  async getDocuments(
    tenantId: string,
    includeInactive = false,
  ): Promise<OnboardingDocumentDocument[]> {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (!includeInactive) query.isActive = true;

    return this.docModel
      .find(query)
      .sort({ order: 1, createdAt: 1 })
      .lean() as any;
  }

  async updateDocument(
    tenantId: string,
    docId: string,
    dto: UpdateOnboardingDocumentDto,
    file?: Express.Multer.File,
  ): Promise<OnboardingDocumentDocument> {
    const existing = await this.docModel.findOne({
      _id: docId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!existing) throw new NotFoundException('Onboarding document not found');

    const update: any = { ...dto };

    if (file) {
      // Replace the PDF — remove old file from disk if present
      if (existing.fileUrl) {
        const oldPath = this.urlToDiskPath(existing.fileUrl);
        if (oldPath && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      update.fileUrl = this.buildFileUrl(file.filename);
      update.originalFileName = file.originalname;
    }

    const updated = await this.docModel.findOneAndUpdate(
      { _id: docId, tenantId: new Types.ObjectId(tenantId) },
      { $set: update },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Onboarding document not found');
    return updated;
  }

  async deleteDocument(tenantId: string, docId: string): Promise<void> {
    const doc = await this.docModel.findOne({
      _id: docId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!doc) throw new NotFoundException('Onboarding document not found');

    if (doc.fileUrl) {
      const diskPath = this.urlToDiskPath(doc.fileUrl);
      if (diskPath && fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    }

    await this.docModel.findOneAndDelete({
      _id: docId,
      tenantId: new Types.ObjectId(tenantId),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // EMPLOYEE — self-service onboarding flow
  // ═══════════════════════════════════════════════════════════

  /**
   * Called right after login. Tells the frontend whether to redirect
   * to the mandatory onboarding flow, and if so, what to show.
   */
  async getMyStatus(userId: string) {
    const employee = await this.employeeModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean();
    if (!employee) throw new NotFoundException('Employee profile not found');

    if (employee.onboardingCompleted) {
      return { completed: true, documents: [] };
    }

    const documents = await this.getDocuments(employee.tenantId.toString());
    return { completed: false, documents };
  }

  async completeOnboarding(
    userId: string,
    dto: CompleteOnboardingDto,
    ipAddress?: string,
  ): Promise<EmployeeOnboardingDocument> {
    const employee = await this.employeeModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!employee) throw new NotFoundException('Employee profile not found');

    if (employee.onboardingCompleted) {
      throw new ConflictException('Onboarding has already been completed.');
    }

    const activeDocs = await this.getDocuments(employee.tenantId.toString());
    if (activeDocs.length === 0) {
      throw new BadRequestException(
        'No onboarding documents are configured. Contact your administrator.',
      );
    }

    // Every currently-active document must be in the acknowledged list
    const activeIds = new Set(activeDocs.map((d: any) => d._id.toString()));
    const ackedIds = new Set(dto.acknowledgedDocumentIds);

    const missing = [...activeIds].filter((id) => !ackedIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        'All onboarding documents must be acknowledged before submitting.',
      );
    }

    const acknowledgements = activeDocs.map((d: any) => ({
      documentId: d._id,
      documentTitle: d.title,
      acknowledged: true,
    }));

    const record = await this.ackModel.create({
      employeeId: employee._id,
      tenantId: employee.tenantId,
      signatureName: dto.signatureName.trim(),
      signedAt: new Date(),
      ipAddress: ipAddress ?? null,
      acknowledgements,
      completedAt: new Date(),
    });

    await this.employeeModel.findByIdAndUpdate(employee._id, {
      onboardingCompleted: true,
    });

    return record;
  }

  // ═══════════════════════════════════════════════════════════
  // TENANT ADMIN — view a specific employee's onboarding record
  // Used by the Employee Detail Sheet's Onboarding tab
  // ═══════════════════════════════════════════════════════════

  async getEmployeeOnboardingRecord(employeeId: string, tenantId: string) {
    const employee = await this.employeeModel
      .findOne({ _id: employeeId, tenantId: new Types.ObjectId(tenantId) })
      .select('onboardingCompleted')
      .lean();
    if (!employee) throw new NotFoundException('Employee not found');

    const record = await this.ackModel
      .findOne({
        employeeId: new Types.ObjectId(employeeId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .lean();

    return {
      completed: employee.onboardingCompleted ?? false,
      record: record ?? null,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════

  private buildFileUrl(filename: string): string {
    const baseUrl =
      process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
    return `${baseUrl}/uploads/employee/onboarding/${filename}`;
  }

  // Reverses buildFileUrl to get the disk path for deletion
  private urlToDiskPath(fileUrl: string): string | null {
    const marker = '/uploads/employee/onboarding/';
    const idx = fileUrl.indexOf(marker);
    if (idx === -1) return null;
    const filename = fileUrl.slice(idx + marker.length);
    return `uploads/employee/onboarding/${filename}`;
  }
}
