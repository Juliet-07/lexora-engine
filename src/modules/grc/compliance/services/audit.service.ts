import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  AuditEngagement,
  AuditEngagementDocument,
  AuditEngagementStatus,
  AuditType,
  RequestStatus,
  NEXT_STATUS,
} from '../schemas';
import {
  CreateAuditDto,
  SetAuditStatusDto,
  AddRequestDto,
  DisputeRequestDto,
  ResolveRequestDto,
  AddFindingDto,
  UpdateFindingDto,
} from '../dtos';
import { HrTeam, HrTeamDocument } from 'src/modules/hr/schemas';
import {
  Employee,
  EmployeeDocument,
  EmployeeHierarchyRole,
} from 'src/modules/hr/schemas/employee.schema';

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditEngagement.name)
    private readonly model: Model<AuditEngagementDocument>,
    // Direct model injection across the HR/Compliance module boundary —
    // not EmployeeService — per this codebase's established fix for
    // cross-module DI breaking at runtime (see PolicyService's Employee
    // injection for the same pattern).
    @InjectModel(HrTeam.name)
    private readonly teamModel: Model<HrTeamDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Auto-select the tenant's Audit team + its HOD as lead auditor,
  // for Internal engagements. Never accepts a client-supplied team or
  // lead — this is exactly the "auto-select" the PO asked for. ──
  private async resolveInternalTeamLead(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const team = await this.teamModel
      .findOne({ tenantId: tId, isAuditTeam: true, isActive: true })
      .lean();
    if (!team) {
      throw new BadRequestException(
        'No Audit team has been set up yet. In HR → Teams, mark a team as the Audit team before creating an internal audit engagement.',
      );
    }
    const hod = await this.employeeModel
      .findOne({
        tenantId: tId,
        teamId: team._id,
        hierarchyRole: EmployeeHierarchyRole.HEAD_OF_DEPARTMENT,
        employmentStatus: { $nin: ['terminated', 'resigned'] },
      })
      .select('firstName lastName')
      .lean();
    if (!hod) {
      throw new BadRequestException(
        `The Audit team ("${team.name}") has no Head of Department assigned yet — assign one in HR → Teams before creating an internal audit engagement.`,
      );
    }
    return {
      teamId: team._id,
      teamName: team.name,
      leadEmployeeId: hod._id,
      leadName: `${hod.firstName} ${hod.lastName}`.trim(),
    };
  }

  private async employeeUserId(
    employeeId: Types.ObjectId | string | null,
  ): Promise<string | null> {
    if (!employeeId) return null;
    const emp = await this.employeeModel
      .findById(employeeId)
      .select('userId')
      .lean();
    return emp?.userId ? emp.userId.toString() : null;
  }

  async create(tenantId: string, dto: CreateAuditDto) {
    const base: any = {
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      type: dto.type,
      scope: dto.scope ?? '',
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      status: AuditEngagementStatus.PLANNED,
      linkedRiskIds: (dto.linkedRiskIds ?? []).map(
        (id) => new Types.ObjectId(id),
      ),
      requests: [],
      findings: [],
    };

    if (dto.type === AuditType.INTERNAL) {
      const { teamId, teamName, leadEmployeeId, leadName } =
        await this.resolveInternalTeamLead(tenantId);
      base.auditTeamId = teamId;
      base.auditTeamName = teamName;
      base.leadAuditorEmployeeId = leadEmployeeId;
      base.leadAuditorName = leadName;
      base.externalAuditorName = '';
    } else {
      if (!dto.externalAuditorName?.trim()) {
        throw new BadRequestException(
          'External auditor name is required for an External engagement.',
        );
      }
      base.auditTeamId = null;
      base.auditTeamName = '';
      base.leadAuditorEmployeeId = null;
      base.leadAuditorName = '';
      base.externalAuditorName = dto.externalAuditorName.trim();
    }

    return this.model.create(base);
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<AuditEngagementDocument> {
    const a = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!a) throw new NotFoundException('Audit engagement not found');
    return a;
  }

  async setStatus(tenantId: string, id: string, dto: SetAuditStatusDto) {
    const a = await this.getRawDoc(tenantId, id);
    if (NEXT_STATUS[a.status] !== dto.status) {
      throw new BadRequestException(
        `Cannot move directly from ${a.status} to ${dto.status}.`,
      );
    }
    a.status = dto.status;
    await a.save();
    return a;
  }

  // ═══════════════════════════════════════════════════════════
  // DOCUMENT REQUEST PORTAL
  // ═══════════════════════════════════════════════════════════

  async addRequest(tenantId: string, id: string, dto: AddRequestDto) {
    const a = await this.getRawDoc(tenantId, id);
    const emp = await this.employeeModel
      .findOne({
        _id: dto.assignedToEmployeeId,
        tenantId: new Types.ObjectId(tenantId),
      })
      .select('firstName lastName userId')
      .lean();
    if (!emp) throw new NotFoundException('Employee not found');
    const assignedToName = `${emp.firstName} ${emp.lastName}`.trim();

    a.requests.push({
      description: dto.description,
      folder: dto.folder ?? '',
      assignedToEmployeeId: emp._id,
      assignedToName,
      dueDate: new Date(dto.dueDate),
      status: RequestStatus.REQUESTED,
      files: [],
    } as any);
    a.markModified('requests');
    await a.save();

    if (emp.userId) {
      this.eventEmitter.emit('grc.audit.document_requested', {
        tenantId,
        employeeUserId: emp.userId.toString(),
        auditName: a.name,
        description: dto.description,
        dueDate: dto.dueDate,
      });
    }
    return a;
  }

  /** Every document request assigned to the logged-in employee, across
   * all of the tenant's audit engagements — the data behind the
   * employee-facing "My audit requests" portal page. */
  async getMyRequests(tenantId: string, employeeId: string) {
    const engagements = await this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        'requests.assignedToEmployeeId': new Types.ObjectId(employeeId),
      })
      .select('name type requests')
      .lean();

    const out: any[] = [];
    for (const e of engagements) {
      for (const r of e.requests as any[]) {
        if (String(r.assignedToEmployeeId) === String(employeeId)) {
          out.push({
            ...r,
            _id: r._id.toString(),
            auditId: e._id.toString(),
            auditName: e.name,
            auditType: e.type,
          });
        }
      }
    }
    return out.sort(
      (x, y) => new Date(x.dueDate).getTime() - new Date(y.dueDate).getTime(),
    );
  }

  private async findByRequestId(tenantId: string, requestId: string) {
    const a = await this.model.findOne({
      tenantId: new Types.ObjectId(tenantId),
      'requests._id': new Types.ObjectId(requestId),
    });
    if (!a) throw new NotFoundException('Request not found');
    const r = (a.requests as any).id(requestId);
    if (!r) throw new NotFoundException('Request not found');
    return { a, r };
  }

  /** Notify whoever should hear about portal activity on a request —
   * the resolved lead auditor for an Internal engagement, falling back
   * to the tenant owner account (mirrors resolveRecipient elsewhere:
   * a real owner where one is set, the tenant account otherwise). */
  private async requestRecipient(a: AuditEngagementDocument): Promise<string> {
    const leadUserId = await this.employeeUserId(a.leadAuditorEmployeeId);
    return leadUserId ?? a.tenantId.toString();
  }

  async submitRequestFiles(
    tenantId: string,
    requestId: string,
    employeeId: string,
    files: Express.Multer.File[],
    uploaderName: string,
  ) {
    if (!files?.length) throw new BadRequestException('No files uploaded.');
    const { a, r } = await this.findByRequestId(tenantId, requestId);
    if (String(r.assignedToEmployeeId) !== String(employeeId)) {
      throw new ForbiddenException('This request is not assigned to you.');
    }
    for (const file of files) {
      r.files.push({
        name: file.originalname,
        fileUrl: `/uploads/grc/audits/${file.filename}`,
        uploadedAt: new Date(),
        uploadedBy: uploaderName || 'You',
      });
    }
    if (
      r.status === RequestStatus.REQUESTED ||
      r.status === RequestStatus.DISPUTED
    ) {
      r.status = RequestStatus.SUBMITTED;
    }
    a.markModified('requests');
    await a.save();

    const recipient = await this.requestRecipient(a);
    this.eventEmitter.emit('tenant.audit_document.submitted', {
      tenantId,
      recipientUserId: recipient,
      auditName: a.name,
      requestDescription: r.description,
      submittedBy: uploaderName || 'An employee',
    });
    return a;
  }

  async disputeRequest(
    tenantId: string,
    requestId: string,
    employeeId: string,
    dto: DisputeRequestDto,
  ) {
    const { a, r } = await this.findByRequestId(tenantId, requestId);
    if (String(r.assignedToEmployeeId) !== String(employeeId)) {
      throw new ForbiddenException('This request is not assigned to you.');
    }
    r.status = RequestStatus.DISPUTED;
    r.disputeReason = dto.reason;
    r.disputedAt = new Date();
    a.markModified('requests');
    await a.save();

    const recipient = await this.requestRecipient(a);
    this.eventEmitter.emit('tenant.audit_document.disputed', {
      tenantId,
      recipientUserId: recipient,
      auditName: a.name,
      requestDescription: r.description,
      reason: dto.reason,
    });
    return a;
  }

  /** Tenant/auditor-side: close out a dispute (or otherwise mark a
   * request resolved) with a note. */
  async resolveRequest(
    tenantId: string,
    id: string,
    requestId: string,
    resolvedBy: string,
    dto: ResolveRequestDto,
  ) {
    const a = await this.getRawDoc(tenantId, id);
    const r = (a.requests as any).id(requestId);
    if (!r) throw new NotFoundException('Request not found');
    r.status = RequestStatus.RESOLVED;
    r.resolutionNote = dto.note ?? '';
    r.resolvedAt = new Date();
    r.resolvedBy = resolvedBy;
    a.markModified('requests');
    await a.save();

    const employeeUserId = await this.employeeUserId(r.assignedToEmployeeId);
    if (employeeUserId) {
      this.eventEmitter.emit('employee.audit_document.resolved', {
        tenantId,
        employeeUserId,
        auditName: a.name,
        requestDescription: r.description,
      });
    }
    return a;
  }

  /** Everything submitted so far for this engagement, bundled into a
   * single zip — grouped by each request's tenant-defined folder, same
   * pattern as the Deal Room data-room zip. */
  async buildRequestsZip(
    tenantId: string,
    id: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const a = await this.getRawDoc(tenantId, id);
    // Same archiver usage as Deal Room's buildDataRoomZip — this
    // package's v8 is ESM-only and exports the ZipArchive class
    // directly rather than the classic archiver('zip') factory call.
    const { ZipArchive } = require('archiver');
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const archive = new ZipArchive({ zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      for (const r of a.requests) {
        const folder = (r.folder || 'General').replace(/[\\/]/g, '-');
        for (const f of r.files) {
          const diskPath = join(process.cwd(), f.fileUrl);
          if (existsSync(diskPath)) {
            archive.file(diskPath, { name: `${folder}/${f.name}` });
          }
        }
      }
      archive.finalize();
    });

    return {
      buffer,
      filename: `${a.name.replace(/[^a-z0-9]+/gi, '_')}_documents.zip`,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // FINDINGS — unchanged this round
  // ═══════════════════════════════════════════════════════════

  async addFinding(tenantId: string, id: string, dto: AddFindingDto) {
    const a = await this.getRawDoc(tenantId, id);
    a.findings.push({
      observation: dto.observation,
      condition: dto.condition ?? '',
      criteria: dto.criteria ?? '',
      cause: dto.cause ?? '',
      consequence: dto.consequence ?? '',
      recommendation: dto.recommendation ?? '',
      severity: dto.severity,
      status: 'Open',
      managementResponse: '',
      remediationDueDate: null,
      createdAt: new Date(),
    } as any);
    a.markModified('findings');
    await a.save();
    return a;
  }

  async updateFinding(
    tenantId: string,
    id: string,
    index: number,
    dto: UpdateFindingDto,
  ) {
    const a = await this.getRawDoc(tenantId, id);
    const f = a.findings[index];
    if (!f) throw new NotFoundException('Finding not found');
    if (dto.managementResponse !== undefined)
      f.managementResponse = dto.managementResponse;
    if (dto.remediationDueDate !== undefined)
      f.remediationDueDate = new Date(dto.remediationDueDate);
    if (dto.status !== undefined) f.status = dto.status;
    a.markModified('findings');
    await a.save();
    return a;
  }
}
