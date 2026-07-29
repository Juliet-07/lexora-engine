import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Certification, CertificationDocument, RenewalStage } from '../schemas';
import {
  CreateCertificationDto,
  UpdateRenewalStageDto,
  RecordRenewalDto,
} from '../dtos';

@Injectable()
export class CertificationService {
  constructor(
    @InjectModel(Certification.name)
    private readonly model: Model<CertificationDocument>,
  ) {}

  async create(tenantId: string, dto: CreateCertificationDto) {
    return this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      issuingBody: dto.issuingBody ?? '',
      certificateNumber: dto.certificateNumber ?? '',
      issueDate: new Date(dto.issueDate),
      expiryDate: new Date(dto.expiryDate),
      renewalRequirements: dto.renewalRequirements ?? '',
      cost: dto.cost ?? 0,
      currency: dto.currency ?? 'RWF',
      responsiblePerson: dto.responsiblePerson ?? '',
      leadTimeDays: dto.leadTimeDays ?? 60,
      renewalStage: RenewalStage.CURRENT,
      evidence: [],
    });
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ expiryDate: 1 })
      .lean();
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<CertificationDocument> {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Certification not found');
    return c;
  }

  async updateStage(tenantId: string, id: string, dto: UpdateRenewalStageDto) {
    const c = await this.getRawDoc(tenantId, id);
    c.renewalStage = dto.renewalStage;
    await c.save();
    return c;
  }

  // Closes the renewal cycle — new expiry, stage resets to Current —
  // matches "Record renewal" exactly.
  async recordRenewal(tenantId: string, id: string, dto: RecordRenewalDto) {
    const c = await this.getRawDoc(tenantId, id);
    c.expiryDate = new Date(dto.newExpiryDate);
    c.renewalStage = RenewalStage.CURRENT;
    await c.save();
    return c;
  }

  // uploadedBy resolved server-side from the cert's own
  // responsiblePerson field — never trusted from the client, same
  // convention as Compliance Obligations' evidence attribution.
  async addEvidence(
    tenantId: string,
    id: string,
    files: Express.Multer.File[],
  ) {
    const c = await this.getRawDoc(tenantId, id);
    for (const file of files) {
      c.evidence.push({
        name: file.originalname,
        fileUrl: `/uploads/compliance/certifications/${file.filename}`,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
        uploadedBy: c.responsiblePerson || 'Unassigned',
      } as any);
    }
    c.markModified('evidence');
    await c.save();
    return c;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.model.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Certification not found');
  }
}
