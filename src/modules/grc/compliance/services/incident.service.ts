import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Incident,
  IncidentDocument,
  IncidentStatus,
  ActionStatus,
} from '../schemas';
import {
  CreateIncidentDto,
  UpdateIncidentFieldsDto,
  AddIncidentFindingDto,
  AddIncidentActionDto,
  UpdateIncidentActionStatusDto,
  AddIncidentLessonDto,
} from '../dtos';

@Injectable()
export class IncidentService {
  constructor(
    @InjectModel(Incident.name)
    private readonly model: Model<IncidentDocument>,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.model.countDocuments({
      tenantId,
      ref: new RegExp(`^INC-${year}-`),
    });
    return `INC-${year}-${String(count + 1).padStart(3, '0')}`;
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<IncidentDocument> {
    const i = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!i) throw new NotFoundException('Incident not found');
    return i;
  }

  private log(i: IncidentDocument, event: string, detail?: string) {
    i.timeline.push({ at: new Date(), event, detail: detail ?? '' } as any);
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  // reportedBy/reportedByUserId are resolved server-side from the
  // logged-in user (or blanked out for an anonymous report) — never
  // taken from the request body, matching every other real-attribution
  // field in this module (see PolicyController.acknowledgeAsEmployee).
  async create(
    tenantId: string,
    dto: CreateIncidentDto,
    reporterName: string,
    reporterUserId: string,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const anonymous = dto.anonymous ?? false;
    const created = await this.model.create({
      tenantId: tId,
      ref,
      title: dto.title,
      category: dto.category,
      severity: dto.severity,
      status: IncidentStatus.OPEN,
      occurred: dto.occurred ? new Date(dto.occurred) : new Date(dto.reported),
      reported: new Date(dto.reported),
      reportedBy: anonymous ? 'Anonymous' : reporterName || 'You',
      reportedByUserId: anonymous ? null : new Types.ObjectId(reporterUserId),
      anonymous,
      assignedTo: reporterName || 'Compliance Officer',
      description: dto.description,
      persons: dto.persons ?? '',
      clients: dto.clients ?? '',
      policies: dto.policy ? [dto.policy] : [],
      immediateActions: dto.immediateActions ?? '',
      timeline: [
        {
          at: new Date(),
          event: `Incident reported by ${anonymous ? 'Anonymous' : reporterName || 'You'}`,
          detail: `Category: ${dto.category} · Severity: ${dto.severity}`,
        },
      ],
    });
    return created;
  }

  // One flexible endpoint for every single-field edit the Detail view
  // makes (see UpdateIncidentFieldsDto's doc comment) — status
  // transitions get the same server-side guard the frontend enforces
  // client-side (can't close with open remediation actions), since a
  // workflow gate only client-side isn't a real gate.
  async updateFields(
    tenantId: string,
    id: string,
    dto: UpdateIncidentFieldsDto,
  ) {
    const i = await this.getRawDoc(tenantId, id);

    if (dto.status && dto.status !== i.status) {
      if (
        dto.status === IncidentStatus.CLOSED &&
        i.actions.some((a) => a.status !== ActionStatus.DONE)
      ) {
        throw new ConflictException(
          'Complete all remediation actions before closing this incident.',
        );
      }
      i.status = dto.status as IncidentStatus;
    }
    if (dto.category !== undefined) i.category = dto.category;
    if (dto.severity !== undefined) i.severity = dto.severity;
    if (dto.assignedTo !== undefined) i.assignedTo = dto.assignedTo;
    if (dto.escalatedTo !== undefined) i.escalatedTo = dto.escalatedTo;
    if (dto.regulatoryReport !== undefined)
      i.regulatoryReport = dto.regulatoryReport;
    if (dto.investigationNotes !== undefined)
      i.investigationNotes = dto.investigationNotes;
    if (dto.impact) i.impact = { ...i.impact, ...dto.impact } as any;
    if (dto.rootCauses !== undefined) i.rootCauses = dto.rootCauses;
    if (dto.rootNarrative !== undefined) i.rootNarrative = dto.rootNarrative;

    if (dto.timelineEvent) this.log(i, dto.timelineEvent, dto.timelineDetail);
    await i.save();
    return i;
  }

  async addFinding(tenantId: string, id: string, dto: AddIncidentFindingDto) {
    const i = await this.getRawDoc(tenantId, id);
    const ref = `F-${String(i.findings.length + 1).padStart(2, '0')}`;
    i.findings.push({
      ref,
      finding: dto.finding,
      severity: dto.severity,
      action: dto.action ?? '',
    } as any);
    this.log(i, `Finding added: ${dto.finding}`);
    await i.save();
    return i;
  }

  async addAction(tenantId: string, id: string, dto: AddIncidentActionDto) {
    const i = await this.getRawDoc(tenantId, id);
    i.actions.push({
      action: dto.action,
      owner: dto.owner || i.assignedTo,
      due: dto.due ? new Date(dto.due) : null,
      status: ActionStatus.PENDING,
    } as any);
    this.log(i, `Action added: ${dto.action}`);
    await i.save();
    return i;
  }

  async updateActionStatus(
    tenantId: string,
    id: string,
    index: number,
    dto: UpdateIncidentActionStatusDto,
  ) {
    const i = await this.getRawDoc(tenantId, id);
    const action = i.actions[index];
    if (!action) throw new NotFoundException('Action not found');
    action.status = dto.status;
    this.log(
      i,
      dto.status === ActionStatus.DONE
        ? `Action completed: ${action.action}`
        : `Action ${action.action} → ${dto.status}`,
    );
    await i.save();
    return i;
  }

  async addLesson(
    tenantId: string,
    id: string,
    dto: AddIncidentLessonDto,
    byName: string,
  ) {
    const i = await this.getRawDoc(tenantId, id);
    i.lessons.push({
      title: dto.title,
      category: dto.category || 'Process',
      detail: dto.detail ?? '',
      by: byName || 'You',
      date: new Date(),
    } as any);
    this.log(i, `Lesson captured: ${dto.title}`);
    await i.save();
    return i;
  }

  // uploadedBy resolved server-side from the real logged-in user,
  // same convention as CertificationService.addEvidence.
  async addFiles(
    tenantId: string,
    id: string,
    files: Express.Multer.File[],
    uploaderName: string,
  ) {
    if (!files?.length) throw new BadRequestException('No files uploaded.');
    const i = await this.getRawDoc(tenantId, id);
    for (const file of files) {
      i.files.push({
        name: file.originalname,
        fileUrl: `/uploads/grc/incidents/${file.filename}`,
        type: (file.originalname.split('.').pop() ?? 'File').toUpperCase(),
        by: uploaderName || 'You',
        date: new Date(),
        size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
      } as any);
    }
    this.log(
      i,
      `Attachment${files.length > 1 ? 's' : ''} added: ${files.map((f) => f.originalname).join(', ')}`,
    );
    await i.save();
    return i;
  }
}
