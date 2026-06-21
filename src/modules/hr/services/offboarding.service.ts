import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OffboardingRecord,
  OffboardingRecordDocument,
  OffboardingStatus,
  OffboardingType,
} from '../schemas';
import { UpdateOffboardingDto } from '../dtos';

const DEFAULT_CLEARANCE_CHECKLIST: { key: string; label: string }[] = [
  { key: 'it_assets', label: 'IT equipment & access revoked' },
  {
    key: 'finance',
    label: 'Finance clearance (expenses, advances, loans settled)',
  },
  {
    key: 'company_property',
    label: 'Company property returned (ID badge, keys, etc.)',
  },
  { key: 'hr_documentation', label: 'Final HR documentation completed' },
];

@Injectable()
export class OffboardingService {
  constructor(
    @InjectModel(OffboardingRecord.name)
    private readonly offboardingModel: Model<OffboardingRecordDocument>,
  ) {}

  // Called from EmployeeService.terminateEmployee() — NOT exposed as
  // a standalone "create offboarding" endpoint, since offboarding
  // should only ever originate from an actual employee exit. Keeps
  // the two flows from drifting out of sync.
  async createFromTermination(params: {
    tenantId: string;
    employeeId: string;
    employeeName: string;
    jobTitle: string;
    endDate: Date;
    reason: string | null;
    status: 'terminated' | 'resigned';
  }): Promise<OffboardingRecordDocument> {
    return this.offboardingModel.create({
      tenantId: new Types.ObjectId(params.tenantId),
      employeeId: new Types.ObjectId(params.employeeId),
      employeeName: params.employeeName,
      jobTitle: params.jobTitle,
      type:
        params.status === 'resigned'
          ? OffboardingType.RESIGNATION
          : OffboardingType.TERMINATION,
      endDate: params.endDate,
      reason: params.reason,
      status: OffboardingStatus.NOT_STARTED,
      clearanceChecklist: DEFAULT_CLEARANCE_CHECKLIST.map((c) => ({
        key: c.key,
        label: c.label,
        cleared: false,
        clearedAt: null,
        notes: null,
      })),
    });
  }

  async getAll(
    tenantId: string,
    status?: string,
  ): Promise<OffboardingRecordDocument[]> {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (status) query.status = status;
    return this.offboardingModel
      .find(query)
      .sort({ endDate: -1 })
      .lean() as any;
  }

  async getById(
    tenantId: string,
    recordId: string,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.offboardingModel.findOne({
      _id: recordId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!record) throw new NotFoundException('Offboarding record not found');
    return record;
  }

  async update(
    tenantId: string,
    recordId: string,
    dto: UpdateOffboardingDto,
  ): Promise<OffboardingRecordDocument> {
    const record = await this.getById(tenantId, recordId);

    if (dto.exitInterviewDone !== undefined)
      record.exitInterviewDone = dto.exitInterviewDone;
    if (dto.exitInterviewNotes !== undefined)
      record.exitInterviewNotes = dto.exitInterviewNotes;
    if (dto.handoverNotes !== undefined)
      record.handoverNotes = dto.handoverNotes;
    if (dto.assignedTo !== undefined)
      record.assignedTo = new Types.ObjectId(dto.assignedTo);

    if (dto.clearanceChecklist) {
      const byKey = new Map(record.clearanceChecklist.map((c) => [c.key, c]));
      for (const update of dto.clearanceChecklist) {
        const item = byKey.get(update.key);
        if (item) {
          item.cleared = update.cleared;
          item.clearedAt = update.cleared ? new Date() : null;
          if (update.notes !== undefined) item.notes = update.notes;
        }
      }
    }

    // Derive status from progress — not directly settable, since it
    // should always reflect the actual checklist/interview state
    // rather than risk drifting out of sync with a manually-set flag.
    const allCleared = record.clearanceChecklist.every((c) => c.cleared);
    if (allCleared && record.exitInterviewDone) {
      record.status = OffboardingStatus.COMPLETED;
      record.completedAt = record.completedAt ?? new Date();
    } else if (
      record.clearanceChecklist.some((c) => c.cleared) ||
      record.exitInterviewDone
    ) {
      record.status = OffboardingStatus.IN_PROGRESS;
    }

    await record.save();
    return record;
  }
}
