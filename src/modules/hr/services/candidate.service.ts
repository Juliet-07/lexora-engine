import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Candidate, CandidateDocument, CandidateStage } from '../schemas';
import {
  CreateCandidateDto,
  UpdateCandidateDto,
  MoveCandidateStageDto,
} from '../dtos';
import { EmailService } from 'src/common/utils/mailing/email.service';

const EMPLOYEE_STAGES: CandidateStage[] = [
  CandidateStage.SOURCED,
  CandidateStage.SCREENING,
  CandidateStage.INTERVIEW,
  CandidateStage.OFFER,
  CandidateStage.HIRED,
  CandidateStage.REJECTED,
];

const CONSULTANT_STAGES: CandidateStage[] = [
  CandidateStage.SOURCED,
  CandidateStage.SCREENING,
  CandidateStage.HIRED,
  CandidateStage.REJECTED,
];

@Injectable()
export class CandidateService {
  constructor(
    @InjectModel(Candidate.name)
    private readonly candidateModel: Model<CandidateDocument>,
    private readonly emailService: EmailService,
  ) {}

  async getAll(tenantId: string, stage?: string): Promise<CandidateDocument[]> {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (stage) query.stage = stage;
    return this.candidateModel
      .find(query)
      .sort({ updatedAt: -1 })
      .lean() as any;
  }

  async getById(
    tenantId: string,
    candidateId: string,
  ): Promise<CandidateDocument> {
    const candidate = await this.candidateModel.findOne({
      _id: candidateId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!candidate) throw new NotFoundException('Candidate not found');
    return candidate;
  }

  async create(
    tenantId: string,
    dto: CreateCandidateDto,
  ): Promise<CandidateDocument> {
    const tId = new Types.ObjectId(tenantId);
    return this.candidateModel.create({
      tenantId: tId,
      name: dto.name,
      email: dto.email,
      phone: dto.phone ?? null,
      roleAppliedFor: dto.roleAppliedFor,
      source: dto.source ?? 'other',
      workerCategory: dto.workerCategory ?? 'employee',
      notes: dto.notes ?? null,
      stage: CandidateStage.SOURCED,
      stageHistory: [{ stage: CandidateStage.SOURCED, enteredAt: new Date() }],
    });
  }

  async update(
    tenantId: string,
    candidateId: string,
    dto: UpdateCandidateDto,
  ): Promise<CandidateDocument> {
    const candidate = await this.getById(tenantId, candidateId);
    if (dto.name !== undefined) candidate.name = dto.name;
    if (dto.email !== undefined) candidate.email = dto.email;
    if (dto.phone !== undefined) candidate.phone = dto.phone;
    if (dto.roleAppliedFor !== undefined)
      candidate.roleAppliedFor = dto.roleAppliedFor;
    if (dto.source !== undefined) candidate.source = dto.source as any;
    if (dto.rating !== undefined) candidate.rating = dto.rating;
    if (dto.notes !== undefined) candidate.notes = dto.notes;
    await candidate.save();
    return candidate;
  }

  // businessName is REQUIRED — resolved by the controller from the
  // real tenant record (User.tenantProfile.businessName) before
  // this is called, and threaded into the interview/hired emails.
  async moveStage(
    tenantId: string,
    candidateId: string,
    dto: MoveCandidateStageDto,
    businessName: string,
  ): Promise<CandidateDocument> {
    const candidate = await this.getById(tenantId, candidateId);
    const newStage = dto.stage as CandidateStage;

    if (candidate.stage === newStage) {
      throw new BadRequestException(
        `Candidate is already in the "${newStage}" stage.`,
      );
    }

    const validStages =
      candidate.workerCategory === 'consultant'
        ? CONSULTANT_STAGES
        : EMPLOYEE_STAGES;
    if (!validStages.includes(newStage)) {
      throw new BadRequestException(
        `"${newStage}" is not a valid stage for a ${candidate.workerCategory}.`,
      );
    }

    candidate.stage = newStage;
    candidate.stageHistory.push({ stage: newStage, enteredAt: new Date() });

    if (newStage === CandidateStage.REJECTED) {
      candidate.rejectionReason =
        dto.rejectionReason ?? candidate.rejectionReason;
    }

    await candidate.save();

    try {
      if (newStage === CandidateStage.INTERVIEW) {
        await this.emailService.sendInterviewInvite({
          to: candidate.email,
          candidateName: candidate.name,
          roleAppliedFor: candidate.roleAppliedFor,
          businessName,
        });
      } else if (newStage === CandidateStage.HIRED) {
        await this.emailService.sendHiredNotification({
          to: candidate.email,
          candidateName: candidate.name,
          roleAppliedFor: candidate.roleAppliedFor,
          workerCategory: candidate.workerCategory,
          businessName,
        });
      } else if (newStage === CandidateStage.REJECTED) {
        await this.emailService.sendRejectionNotification({
          to: candidate.email,
          candidateName: candidate.name,
          roleAppliedFor: candidate.roleAppliedFor,
        });
      }
    } catch (err) {
      console.error(
        `Failed to send stage-change email for candidate ${candidateId}:`,
        err,
      );
    }

    return candidate;
  }

  async delete(tenantId: string, candidateId: string): Promise<void> {
    const deleted = await this.candidateModel.findOneAndDelete({
      _id: candidateId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Candidate not found');
  }

  async getStageCounts(tenantId: string): Promise<Record<string, number>> {
    const tId = new Types.ObjectId(tenantId);
    const results = await this.candidateModel.aggregate([
      { $match: { tenantId: tId } },
      { $group: { _id: '$stage', count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(results.map((r) => [r._id, r.count]));
  }
}
