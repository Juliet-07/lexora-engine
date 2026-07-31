import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RegulatoryChange,
  RegulatoryChangeDocument,
  ChangeUrgency,
  LoopStatus,
} from '../schemas';
import {
  CreateRegChangeDto,
  UpdateAssessmentDto,
  UpdateLoopActionDto,
} from '../dtos';

const LOOP_FIELDS = [
  'obligationAction',
  'policyAction',
  'clauseAction',
  'advisoryAction',
] as const;
type LoopField = (typeof LOOP_FIELDS)[number];

@Injectable()
export class RegulatoryChangeService {
  constructor(
    @InjectModel(RegulatoryChange.name)
    private readonly model: Model<RegulatoryChangeDocument>,
  ) {}

  async create(tenantId: string, dto: CreateRegChangeDto) {
    // advisory starts Pending ONLY for Action Required urgency, else
    // Not Applicable — matches the original design exactly.
    const advisoryStatus =
      dto.urgency === ChangeUrgency.ACTION_REQUIRED
        ? LoopStatus.PENDING
        : LoopStatus.NOT_APPLICABLE;

    return this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      regulator: dto.regulator,
      publishedAt: new Date(dto.publishedAt),
      summary: dto.summary ?? '',
      fullTextRef: dto.fullTextRef ?? '',
      urgency: dto.urgency,
      practiceAreas: dto.practiceAreas ?? [],
      affectedObligationIds: (dto.affectedObligationIds ?? []).map(
        (id) => new Types.ObjectId(id),
      ),
      affectedPolicyTitles: [],
      assessmentOwner: dto.assessmentOwner ?? '',
      assessmentDeadline: dto.assessmentDeadline
        ? new Date(dto.assessmentDeadline)
        : null,
      assessmentNotes: '',
      assessmentStatus: dto.assessmentOwner ? 'In Progress' : 'Unassigned',
      obligationAction: {
        status: LoopStatus.PENDING,
        note: '',
        completedAt: null,
      },
      policyAction: { status: LoopStatus.PENDING, note: '', completedAt: null },
      clauseAction: { status: LoopStatus.PENDING, note: '', completedAt: null },
      advisoryAction: { status: advisoryStatus, note: '', completedAt: null },
    });
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ publishedAt: -1 })
      .lean();
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<RegulatoryChangeDocument> {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Regulatory change not found');
    return c;
  }

  async updateAssessment(
    tenantId: string,
    id: string,
    dto: UpdateAssessmentDto,
  ) {
    const c = await this.getRawDoc(tenantId, id);
    if (dto.assessmentOwner !== undefined)
      c.assessmentOwner = dto.assessmentOwner;
    if (dto.assessmentDeadline !== undefined)
      c.assessmentDeadline = new Date(dto.assessmentDeadline);
    if (dto.assessmentNotes !== undefined)
      c.assessmentNotes = dto.assessmentNotes;
    if (dto.assessmentStatus !== undefined)
      c.assessmentStatus = dto.assessmentStatus;
    await c.save();
    return c;
  }

  async updateLoopAction(
    tenantId: string,
    id: string,
    field: string,
    dto: UpdateLoopActionDto,
  ) {
    if (!LOOP_FIELDS.includes(field as LoopField)) {
      throw new BadRequestException('Invalid loop action.');
    }
    const c = await this.getRawDoc(tenantId, id);
    const action = c[field as LoopField];
    if (dto.status !== undefined) {
      action.status = dto.status;
      action.completedAt =
        dto.status === LoopStatus.DONE ? new Date() : action.completedAt;
    }
    if (dto.note !== undefined) action.note = dto.note;
    await c.save();
    return c;
  }
}
