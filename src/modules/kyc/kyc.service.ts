import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { KycRecord, KycRecordDocument, KycStatus } from './schemas/kyc-record.schema';
import { RiskAssessment, RiskAssessmentDocument } from './schemas/risk-assessment.schema';
import { ScreeningResult, ScreeningResultDocument, ScreeningStatus } from './schemas/screening-result.schema';
import { SubmitKycDto, ReviewKycDto, RunScreeningDto, UpdateScreeningDto, RiskScoreDto } from './dto/kyc.dto';
import { PaginationDto, paginate } from '../../common/pagination.dto';

@Injectable()
export class KycService {
  constructor(
    @InjectModel(KycRecord.name) private kycModel: Model<KycRecordDocument>,
    @InjectModel(RiskAssessment.name) private riskModel: Model<RiskAssessmentDocument>,
    @InjectModel(ScreeningResult.name) private screeningModel: Model<ScreeningResultDocument>,
  ) {}

  async submitKYC(dto: SubmitKycDto, organizationId: string, submittedBy: string): Promise<KycRecordDocument> {
    const existing = await this.kycModel.findOne({
      clientId: new Types.ObjectId(dto.clientId),
      status: { $in: [KycStatus.PENDING, KycStatus.IN_REVIEW] },
    });
    if (existing) throw new BadRequestException('Active KYC record already exists for this client');

    const kyc = await this.kycModel.create({
      clientId: new Types.ObjectId(dto.clientId),
      organizationId: new Types.ObjectId(organizationId),
      verificationLevel: dto.verificationLevel,
      personalInfo: dto.personalInfo || {},
      identityDocument: dto.identityDocument || {},
      addressInfo: dto.addressInfo || {},
      financialInfo: dto.financialInfo || {},
      auditTrail: [{ action: 'submitted', performedBy: submittedBy, timestamp: new Date(), notes: 'KYC submitted' }],
    });

    return kyc;
  }

  async getKycByClient(clientId: string): Promise<KycRecordDocument[]> {
    return this.kycModel
      .find({ clientId: new Types.ObjectId(clientId) })
      .sort({ createdAt: -1 })
      .lean() as any;
  }

  async getKycById(id: string): Promise<KycRecordDocument> {
    const kyc = await this.kycModel.findById(id).populate('clientId').lean();
    if (!kyc) throw new NotFoundException('KYC record not found');
    return kyc as KycRecordDocument;
  }

  async getAllKyc(organizationId: string, pagination: PaginationDto, status?: KycStatus) {
    const query: any = { organizationId: new Types.ObjectId(organizationId) };
    if (status) query.status = status;

    const { skip, limit, page } = pagination;
    const [data, total] = await Promise.all([
      this.kycModel.find(query).skip(skip).limit(limit).populate('clientId', 'firstName lastName email').lean(),
      this.kycModel.countDocuments(query),
    ]);
    return paginate(data, total, page, limit);
  }

  async reviewKyc(id: string, dto: ReviewKycDto, reviewerId: string): Promise<KycRecordDocument> {
    const kyc = await this.kycModel.findById(id);
    if (!kyc) throw new NotFoundException('KYC record not found');
    if (kyc.status === KycStatus.APPROVED || kyc.status === KycStatus.REJECTED) {
      throw new BadRequestException('KYC already finalized');
    }

    kyc.status = dto.status;
    kyc.reviewedBy = reviewerId;
    kyc.reviewedAt = new Date();
    if (dto.rejectionReason) kyc.rejectionReason = dto.rejectionReason;
    if (dto.status === KycStatus.APPROVED) {
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 1);
      kyc.expiresAt = expiry;
    }
    kyc.auditTrail.push({
      action: dto.status,
      performedBy: reviewerId,
      timestamp: new Date(),
      notes: dto.notes || dto.rejectionReason || '',
    });

    return kyc.save();
  }

  async runScreening(dto: RunScreeningDto, organizationId: string): Promise<ScreeningResultDocument> {
    // In production: integrate with a real sanctions/PEP screening provider
    const screening = await this.screeningModel.create({
      clientId: new Types.ObjectId(dto.clientId),
      organizationId: new Types.ObjectId(organizationId),
      status: ScreeningStatus.CLEAR,
      sanctionsMatches: [],
      pepMatches: [],
      adverseMediaMatches: [],
      nextScreeningDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    return screening;
  }

  async getScreeningsByClient(clientId: string): Promise<ScreeningResultDocument[]> {
    return this.screeningModel
      .find({ clientId: new Types.ObjectId(clientId) })
      .sort({ createdAt: -1 })
      .lean() as any;
  }

  async updateScreening(id: string, dto: UpdateScreeningDto, reviewerId: string): Promise<ScreeningResultDocument> {
    const result = await this.screeningModel.findByIdAndUpdate(
      id,
      { status: dto.status, notes: dto.notes, reviewedBy: reviewerId, reviewedAt: new Date() },
      { new: true },
    );
    if (!result) throw new NotFoundException('Screening result not found');
    return result;
  }

  async calculateRiskScore(kycId: string, dto: RiskScoreDto, assessedBy: string): Promise<RiskAssessmentDocument> {
    const kyc = await this.kycModel.findById(kycId);
    if (!kyc) throw new NotFoundException('KYC record not found');

    let riskLevel: string;
    if (dto.overallScore < 25) riskLevel = 'low';
    else if (dto.overallScore < 50) riskLevel = 'medium';
    else if (dto.overallScore < 75) riskLevel = 'high';
    else riskLevel = 'critical';

    const assessment = await this.riskModel.create({
      clientId: kyc.clientId,
      kycRecordId: new Types.ObjectId(kycId),
      organizationId: kyc.organizationId,
      overallScore: dto.overallScore,
      riskLevel,
      factors: dto.factors || {},
      riskFlags: dto.riskFlags || [],
      recommendations: dto.recommendations || [],
      assessedBy,
      nextReviewDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    });

    await this.kycModel.findByIdAndUpdate(kycId, { riskScore: dto.overallScore });
    return assessment;
  }

  async getRiskAssessments(clientId: string): Promise<RiskAssessmentDocument[]> {
    return this.riskModel
      .find({ clientId: new Types.ObjectId(clientId) })
      .sort({ createdAt: -1 })
      .lean() as any;
  }
}
