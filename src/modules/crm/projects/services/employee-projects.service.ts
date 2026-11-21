import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  KbAudience,
  KbStatus,
  Mandate,
  MandateDocument_,
  Task,
  TaskDocument_,
  TicketStatus,
  EmployeeMessageDirection,
  AdrCase,
  AdrCaseDocument,
  AdrTimelineSource,
  LitigationCase,
  LitigationCaseDocument,
  LitigationTimelineSource,
} from '../schemas';
import {
  Employee,
  EmployeeDocument,
  EmployeeHierarchyRole,
} from 'src/modules/hr/schemas';
import {
  UpdateMyTaskDto,
  CreateManagerTaskDto,
  UpdateManagerTaskDto,
  CreateEmployeeMessageDto,
  ReplyGroupMessageDto,
  CreateMyTimeEntryDto,
  UpdateTicketStatusDto,
  AddTicketNoteDto,
  VoteKbArticleDto,
} from '../dtos';
import { MandateWorkspaceService } from './mandate-workspace.service';
import { TaskService } from './task.service';
import { TimeEntryService } from './time-entry.service';
import { TicketService } from './ticket.service';
import { KbArticleService } from './kb-article.service';

@Injectable()
export class MyProjectsService {
  constructor(
    @InjectModel(Mandate.name)
    private readonly mandateModel: Model<MandateDocument_>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument_>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(AdrCase.name)
    private readonly adrCaseModel: Model<AdrCaseDocument>,
    @InjectModel(LitigationCase.name)
    private readonly litigationCaseModel: Model<LitigationCaseDocument>,
    private readonly workspaceService: MandateWorkspaceService,
    private readonly taskService: TaskService,
    private readonly timeEntryService: TimeEntryService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // The mandate's manager is its team's Head of Department — an
  // employee is "the manager" of a mandate when they are an active HOD
  // of the team it is assigned to. Checked live, so it follows the team.
  private isManagerOf(employee: any, mandate: any): boolean {
    return (
      !!employee &&
      employee.hierarchyRole === EmployeeHierarchyRole.HEAD_OF_DEPARTMENT &&
      !!employee.teamId &&
      !!mandate.teamId &&
      String(employee.teamId) === String(mandate.teamId)
    );
  }

  // Every method here needs to know which real Employee record the
  // caller is — `userId` (the JWT subject) is the employee's own
  // account, distinct from `tenantId`, which identifies their
  // employer. Task.assigneeUserId and Mandate.teamId both key off
  // this Employee document's own _id, not the raw User id.
  private async resolveEmployee(tenantId: string, userId: string) {
    const employee = await this.employeeModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      userId: new Types.ObjectId(userId),
    });
    if (!employee) {
      throw new NotFoundException(
        'No employee record is linked to this account',
      );
    }
    return employee;
  }

  private normalizeMandate(m: any) {
    return {
      ...m,
      description: m.description ?? '',
      milestones: m.milestones ?? [],
    };
  }

  // "My mandates" for a genuine employee means only mandates they
  // personally have at least one task on — team assignment alone no
  // longer surfaces a project here. A mandate the employee's team is
  // on but that has no task assigned to them specifically doesn't
  // belong on their dashboard. A tenant-type caller (the account
  // owner, possibly also linked to an Employee record) isn't subject
  // to that restriction at all — they already have full visibility
  // on the tenant side, so scoping "my mandates" to only their
  // personal task links would just be a confusing, narrower view of
  // data they can already see everything of.
  async getMyMandates(tenantId: string, userId: string, userType: string) {
    const tId = new Types.ObjectId(tenantId);

    if (userType === 'tenant') {
      const rows = await this.mandateModel
        .find({ tenantId: tId })
        .sort({ createdAt: -1 })
        .lean();
      return rows.map((m) => this.normalizeMandate(m));
    }

    const employee = await this.resolveEmployee(tenantId, userId);
    const taskMandateIds = await this.taskModel.distinct('mandateId', {
      tenantId: tId,
      assigneeUserId: employee._id,
    });

    // A Head of Department also sees every mandate assigned to their
    // team — they manage it and assign its work, even before they hold a
    // task on it themselves.
    const managesTeam =
      employee.hierarchyRole === EmployeeHierarchyRole.HEAD_OF_DEPARTMENT &&
      employee.teamId;
    const rows = await this.mandateModel
      .find({
        tenantId: tId,
        $or: [
          { _id: { $in: taskMandateIds } },
          ...(managesTeam ? [{ teamId: employee.teamId }] : []),
        ],
      })
      .sort({ createdAt: -1 })
      .lean();
    return rows.map((m) => this.withManagerFlag(m, employee));
  }

  private withManagerFlag(m: any, employee: any) {
    const isManager = this.isManagerOf(employee, m);
    return {
      ...this.normalizeMandate(m),
      isManager,
      ...(isManager
        ? { manager: `${employee.firstName} ${employee.lastName}`.trim() }
        : {}),
    };
  }

  // Same distinction as getMyMandates — a tenant-type caller is
  // never restricted to team/task membership, a genuine employee
  // still is.
  private async getAuthorizedMandate(
    tenantId: string,
    userId: string,
    mandateId: string,
    userType: string,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const mandate = await this.mandateModel
      .findOne({ _id: mandateId, tenantId: tId })
      .lean();
    if (!mandate) throw new NotFoundException('Mandate not found');

    if (userType === 'tenant') {
      // Still resolve the employee record if one exists (needed by
      // callers like messaging, which key a thread off employee._id),
      // but never let its absence or lack of task/team link block
      // access for the account owner.
      const employee = await this.employeeModel.findOne({
        tenantId: tId,
        userId: new Types.ObjectId(userId),
      });
      return { employee, mandate, isManager: false };
    }

    const employee = await this.resolveEmployee(tenantId, userId);
    const onTeam =
      !!employee.teamId && String(mandate.teamId) === String(employee.teamId);
    const hasTask = onTeam
      ? true
      : !!(await this.taskModel.exists({
          tenantId: tId,
          mandateId,
          assigneeUserId: employee._id,
        }));

    if (!onTeam && !hasTask) {
      throw new ForbiddenException("You don't have access to this mandate");
    }
    return {
      employee,
      mandate,
      isManager: this.isManagerOf(employee, mandate),
    };
  }

  async getMandateDetail(
    tenantId: string,
    userId: string,
    mandateId: string,
    userType: string,
  ) {
    const { mandate, employee, isManager } = await this.getAuthorizedMandate(
      tenantId,
      userId,
      mandateId,
      userType,
    );
    return isManager
      ? this.withManagerFlag(mandate, employee)
      : { ...this.normalizeMandate(mandate), isManager: false };
  }

  // The "Board" view. A tenant-type caller sees every task on the
  // mandate, any assignee — same full-visibility rule as everywhere
  // else in this file. A genuine employee only sees their own
  // assigned tasks, even on a mandate their team is on — team
  // membership is what grants them access to the mandate at all, not
  // visibility into every other assignee's work.
  // Delegates to TaskService rather than querying the model
  // directly — loggedHrs/progress are computed there from Approved
  // time entries, not stored, so duplicating the query here would
  // mean returning tasks with no loggedHrs at all.
  async getMandateTasks(
    tenantId: string,
    userId: string,
    mandateId: string,
    userType: string,
  ) {
    const { employee, isManager } = await this.getAuthorizedMandate(
      tenantId,
      userId,
      mandateId,
      userType,
    );
    // The tenant owner and the mandate's manager (team HOD) see every
    // task on the mandate; other team members see only their own.
    if (userType === 'tenant' || isManager) {
      return this.taskService.getAll(tenantId, { mandateId });
    }
    return this.taskService.getAll(tenantId, {
      mandateId,
      assigneeUserId: employee ? String(employee._id) : undefined,
    });
  }

  // Read-only access to the mandate's real documents — reuses the
  // same tenant-side service and data, just gated by team membership
  // instead of UserType.TENANT.
  async getMandateDocuments(
    tenantId: string,
    userId: string,
    mandateId: string,
    userType: string,
  ) {
    await this.getAuthorizedMandate(tenantId, userId, mandateId, userType);
    return this.workspaceService.getDocuments(tenantId, mandateId);
  }

  // Message thread with the tenant, for this mandate. Always the
  // caller's own thread — employeeUserId is resolved server-side
  // from their session, never taken from a request parameter, so
  // there's no way to read or post into someone else's thread. A
  // tenant-type caller with no linked employee record simply can't
  // have a thread of their own — there's no "them" for it to belong
  // to on this side of the conversation.
  async getMyMessages(
    tenantId: string,
    userId: string,
    mandateId: string,
    userType: string,
  ) {
    const { employee } = await this.getAuthorizedMandate(
      tenantId,
      userId,
      mandateId,
      userType,
    );
    if (!employee) {
      throw new NotFoundException(
        'No employee record is linked to this account',
      );
    }
    return this.workspaceService.getEmployeeMessages(
      tenantId,
      mandateId,
      String(employee._id),
    );
  }

  async sendMyMessage(
    tenantId: string,
    userId: string,
    mandateId: string,
    userType: string,
    dto: CreateEmployeeMessageDto,
  ) {
    const { employee } = await this.getAuthorizedMandate(
      tenantId,
      userId,
      mandateId,
      userType,
    );
    if (!employee) {
      throw new NotFoundException(
        'No employee record is linked to this account',
      );
    }
    return this.workspaceService.addEmployeeMessage(
      tenantId,
      mandateId,
      String(employee._id),
      EmployeeMessageDirection.EMPLOYEE,
      dto,
    );
  }

  async getMyGroupMessages(
    tenantId: string,
    userId: string,
    mandateId: string,
    userType: string,
  ) {
    const { employee } = await this.getAuthorizedMandate(
      tenantId,
      userId,
      mandateId,
      userType,
    );
    if (!employee) return [];
    return this.workspaceService.getMyGroupMessages(
      tenantId,
      mandateId,
      String(employee._id),
    );
  }

  async replyToMyGroup(
    tenantId: string,
    userId: string,
    mandateId: string,
    userType: string,
    dto: ReplyGroupMessageDto,
  ) {
    const { employee } = await this.getAuthorizedMandate(
      tenantId,
      userId,
      mandateId,
      userType,
    );
    if (!employee) {
      throw new NotFoundException(
        'No employee record is linked to this account',
      );
    }
    return this.workspaceService.replyToGroup(
      tenantId,
      mandateId,
      String(employee._id),
      dto,
    );
  }

  async getMyThreadUnreadCount(
    tenantId: string,
    userId: string,
    mandateId: string,
    userType: string,
  ) {
    const { employee } = await this.getAuthorizedMandate(
      tenantId,
      userId,
      mandateId,
      userType,
    );
    if (!employee) return 0;
    return this.workspaceService.getMyThreadUnreadCount(
      tenantId,
      mandateId,
      String(employee._id),
    );
  }

  async markMyThreadRead(
    tenantId: string,
    userId: string,
    mandateId: string,
    userType: string,
  ) {
    const { employee } = await this.getAuthorizedMandate(
      tenantId,
      userId,
      mandateId,
      userType,
    );
    if (!employee) {
      throw new NotFoundException(
        'No employee record is linked to this account',
      );
    }
    return this.workspaceService.markMyThreadRead(
      tenantId,
      mandateId,
      String(employee._id),
    );
  }

  // ── Manager (team HOD) task assignment ───────────────────────

  private async requireManager(
    tenantId: string,
    userId: string,
    mandateId: string,
    userType: string,
  ) {
    const ctx = await this.getAuthorizedMandate(
      tenantId,
      userId,
      mandateId,
      userType,
    );
    if (!ctx.isManager) {
      throw new ForbiddenException(
        "Only the Head of Department of this mandate's team can assign its tasks",
      );
    }
    return ctx;
  }

  private async resolveTeamMember(
    tenantId: string,
    mandate: any,
    employeeId: string,
  ) {
    const member = await this.employeeModel
      .findOne({
        _id: employeeId,
        tenantId: new Types.ObjectId(tenantId),
        teamId: mandate.teamId,
        employmentStatus: { $nin: ['terminated', 'resigned'] },
      })
      .select('firstName lastName userId')
      .lean();
    if (!member) {
      throw new BadRequestException(
        "Tasks can only be assigned to members of this mandate's team",
      );
    }
    return {
      id: String(member._id),
      name: `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim(),
      userId: member.userId ? String(member.userId) : null,
    };
  }

  private notifyAssigned(
    tenantId: string,
    mandate: any,
    taskTitle: string,
    assignee: { userId: string | null },
    assignedBy: string,
  ) {
    if (!assignee.userId) return;
    this.eventEmitter.emit('employee.mandate_task_assigned', {
      tenantId,
      employeeUserId: assignee.userId,
      mandateId: String(mandate._id),
      mandateName: mandate.name,
      taskTitle,
      assignedBy,
    });
  }

  async getManagerTeamMembers(
    tenantId: string,
    userId: string,
    mandateId: string,
    userType: string,
  ) {
    const { mandate } = await this.requireManager(
      tenantId,
      userId,
      mandateId,
      userType,
    );
    const members = await this.employeeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        teamId: mandate.teamId,
        employmentStatus: { $nin: ['terminated', 'resigned'] },
      })
      .select('firstName lastName jobTitle')
      .sort({ firstName: 1 })
      .lean();
    return (members as any[]).map((e) => ({
      _id: String(e._id),
      name: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim(),
      jobTitle: e.jobTitle ?? '',
    }));
  }

  async createTaskAsManager(
    tenantId: string,
    userId: string,
    mandateId: string,
    userType: string,
    dto: CreateManagerTaskDto,
  ) {
    const { mandate, employee } = await this.requireManager(
      tenantId,
      userId,
      mandateId,
      userType,
    );
    const assignee = await this.resolveTeamMember(
      tenantId,
      mandate,
      dto.assigneeEmployeeId,
    );
    const task = await this.taskService.create(tenantId, {
      title: dto.title,
      mandateId,
      assignee: assignee.name,
      assigneeUserId: assignee.id,
      priority: dto.priority,
      startDate: dto.startDate,
      dueDate: dto.dueDate,
      estimateHrs: dto.estimateHrs,
      phase: dto.phase,
    });
    this.notifyAssigned(
      tenantId,
      mandate,
      dto.title,
      assignee,
      `${employee?.firstName ?? ''} ${employee?.lastName ?? ''}`.trim(),
    );
    return task;
  }

  async updateTaskAsManager(
    tenantId: string,
    userId: string,
    mandateId: string,
    taskId: string,
    userType: string,
    dto: UpdateManagerTaskDto,
  ) {
    const { mandate, employee } = await this.requireManager(
      tenantId,
      userId,
      mandateId,
      userType,
    );
    const existing = await this.taskModel
      .findOne({
        _id: taskId,
        tenantId: new Types.ObjectId(tenantId),
        mandateId: new Types.ObjectId(mandateId),
      })
      .lean();
    if (!existing) throw new NotFoundException('Task not found');

    const patch: any = {
      title: dto.title,
      priority: dto.priority,
      status: dto.status,
      startDate: dto.startDate,
      dueDate: dto.dueDate,
      estimateHrs: dto.estimateHrs,
    };
    let reassignedTo: { userId: string | null } | null = null;
    if (
      dto.assigneeEmployeeId &&
      String(existing.assigneeUserId ?? '') !== dto.assigneeEmployeeId
    ) {
      const assignee = await this.resolveTeamMember(
        tenantId,
        mandate,
        dto.assigneeEmployeeId,
      );
      patch.assignee = assignee.name;
      patch.assigneeUserId = assignee.id;
      reassignedTo = assignee;
    }
    const task = await this.taskService.update(tenantId, taskId, patch);
    if (reassignedTo) {
      this.notifyAssigned(
        tenantId,
        mandate,
        (task as any).title,
        reassignedTo,
        `${employee?.firstName ?? ''} ${employee?.lastName ?? ''}`.trim(),
      );
    }
    return task;
  }

  async deleteTaskAsManager(
    tenantId: string,
    userId: string,
    mandateId: string,
    taskId: string,
    userType: string,
  ) {
    await this.requireManager(tenantId, userId, mandateId, userType);
    const existing = await this.taskModel.exists({
      _id: taskId,
      tenantId: new Types.ObjectId(tenantId),
      mandateId: new Types.ObjectId(mandateId),
    });
    if (!existing) throw new NotFoundException('Task not found');
    return this.taskService.delete(tenantId, taskId);
  }

  // Just this employee's own tasks — across every mandate, or one
  // mandate if given. The "My Tasks" view. Same delegation reason as
  // getMandateTasks above.
  async getMyTasks(tenantId: string, userId: string, mandateId?: string) {
    const employee = await this.resolveEmployee(tenantId, userId);
    return this.taskService.getAll(tenantId, {
      assigneeUserId: String(employee._id),
      mandateId,
    });
  }

  // An employee can move their own task's status — nothing else, and
  // only on tasks genuinely assigned to them. Delegates the actual
  // save to TaskService.update() so the returned task has correctly
  // computed loggedHrs/progress, same as every other consumer.
  async updateMyTask(
    tenantId: string,
    userId: string,
    taskId: string,
    dto: UpdateMyTaskDto,
  ) {
    const employee = await this.resolveEmployee(tenantId, userId);
    const task = await this.taskModel.findOne({
      _id: taskId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!task) throw new NotFoundException('Task not found');
    if (
      !task.assigneeUserId ||
      String(task.assigneeUserId) !== String(employee._id)
    ) {
      throw new ForbiddenException('This task is not assigned to you');
    }
    return this.taskService.update(tenantId, taskId, { status: dto.status });
  }

  // ── Timesheets (self) ────────────────────────────────────────
  // The employee's own time entries — memberUserId is always the
  // resolved employee's own _id, never taken from the request, same
  // rule as the message thread above. Logging against a mandate
  // reuses getAuthorizedMandate, so an employee can't log time
  // against a mandate they have no real involvement in — and since
  // that already fetches the mandate, its name comes along for free
  // rather than asking the caller to supply it separately.

  async getMyTimeEntries(tenantId: string, userId: string, mandateId?: string) {
    const employee = await this.resolveEmployee(tenantId, userId);
    return this.timeEntryService.getAll(tenantId, {
      memberUserId: String(employee._id),
      mandateId,
    });
  }

  async logMyTime(
    tenantId: string,
    userId: string,
    dto: CreateMyTimeEntryDto,
    userType: string,
  ) {
    // Same tenant-vs-employee distinction as getAuthorizedMandate's
    // every other caller: a tenant-type caller (the owner, possibly
    // acting from their own Employee Workspace) isn't restricted to
    // team/task membership. This used to be hardcoded to 'employee'
    // here, which is exactly what produced "You don't have access to
    // this mandate" for an owner who had genuinely been assigned a
    // task on the mandate — the hardcoding ignored that entirely.
    const { employee, mandate } = await this.getAuthorizedMandate(
      tenantId,
      userId,
      dto.mandateId,
      userType,
    );
    if (!employee) {
      throw new NotFoundException(
        'No employee record is linked to this account',
      );
    }
    return this.timeEntryService.create(tenantId, {
      memberUserId: String(employee._id),
      member: `${employee.firstName} ${employee.lastName}`,
      mandateId: dto.mandateId,
      mandateName: (mandate as any).name,
      taskId: dto.taskId,
      taskTitle: dto.taskTitle,
      narrative: dto.narrative,
      date: dto.date,
      hours: dto.hours,
      billable: dto.billable,
    });
  }

  async submitMyTimeEntry(tenantId: string, userId: string, entryId: string) {
    const employee = await this.resolveEmployee(tenantId, userId);
    const entry = await this.timeEntryService.getById(tenantId, entryId);
    if (String(entry.memberUserId) !== String(employee._id)) {
      throw new ForbiddenException('This time entry is not yours');
    }
    return this.timeEntryService.submit(tenantId, entryId);
  }

  // ═══════════════════════════════════════════════════════════
  // MY CASES — same real team-scoping discipline as getMyMandates:
  // a tenant-type caller sees everything, a genuine employee only
  // sees cases their own team is assigned to (AdrCase.teamId).
  // ═══════════════════════════════════════════════════════════

  async getMyCases(tenantId: string, userId: string, userType: string) {
    const tId = new Types.ObjectId(tenantId);
    const teamFilter =
      userType === 'tenant'
        ? {}
        : { teamId: (await this.resolveEmployee(tenantId, userId)).teamId };
    if (userType !== 'tenant' && !teamFilter.teamId) return [];

    const [adrCases, litigationCases] = await Promise.all([
      this.adrCaseModel
        .find({ tenantId: tId, ...teamFilter })
        .sort({ createdAt: -1 })
        .lean(),
      this.litigationCaseModel
        .find({ tenantId: tId, ...teamFilter })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    return [
      ...adrCases.map((c) => ({ ...c, caseType: 'ADR' as const })),
      ...litigationCases.map((c) => ({
        ...c,
        caseType: 'Litigation' as const,
      })),
    ].sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  private async getAuthorizedCase(
    tenantId: string,
    userId: string,
    caseId: string,
    userType: string,
    caseType: 'adr' | 'litigation' = 'adr',
  ) {
    const model: Model<any> =
      caseType === 'adr' ? this.adrCaseModel : this.litigationCaseModel;
    const c = await model.findOne({
      _id: caseId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Case not found');
    if (userType === 'tenant') return { case: c, employee: null };

    const employee = await this.resolveEmployee(tenantId, userId);
    if (
      !employee.teamId ||
      String(employee.teamId) !== String((c as any).teamId)
    ) {
      throw new ForbiddenException('This case is not assigned to your team');
    }
    return { case: c, employee };
  }

  async getMyCaseDetail(
    tenantId: string,
    userId: string,
    caseId: string,
    userType: string,
    caseType: 'adr' | 'litigation' = 'adr',
  ) {
    const { case: c } = await this.getAuthorizedCase(
      tenantId,
      userId,
      caseId,
      userType,
      caseType,
    );
    return c.toObject();
  }

  async logMyCaseTime(
    tenantId: string,
    userId: string,
    dto: {
      caseId: string;
      caseType?: 'adr' | 'litigation';
      narrative?: string;
      date: string;
      hours: number;
      billable?: boolean;
    },
  ) {
    const caseType = dto.caseType ?? 'adr';
    const { case: c, employee } = await this.getAuthorizedCase(
      tenantId,
      userId,
      dto.caseId,
      'employee',
      caseType,
    );
    // A case does not need a mandate for time to be logged on it — the
    // entry is tied to the case and appears in Timesheets either way.
    const mandate: any = (c as any).mandateId
      ? await this.mandateModel.findById((c as any).mandateId).lean()
      : null;
    return this.timeEntryService.create(tenantId, {
      memberUserId: String(employee!._id),
      member: `${employee!.firstName} ${employee!.lastName}`,
      mandateId: mandate ? String(mandate._id) : undefined,
      mandateName: mandate
        ? mandate.name
        : `${(c as any).ref} · ${(c as any).title}`,
      adrCaseId: caseType === 'adr' ? String(c._id) : undefined,
      litigationCaseId: caseType === 'litigation' ? String(c._id) : undefined,
      narrative: dto.narrative,
      date: dto.date,
      hours: dto.hours,
      billable: dto.billable,
    });
  }

  async logMyCaseCall(
    tenantId: string,
    userId: string,
    caseId: string,
    dto: { summary: string },
    caseType: 'adr' | 'litigation' = 'adr',
  ) {
    const { case: c, employee } = await this.getAuthorizedCase(
      tenantId,
      userId,
      caseId,
      'employee',
      caseType,
    );
    const source =
      caseType === 'adr'
        ? AdrTimelineSource.MANUAL
        : LitigationTimelineSource.MANUAL;
    (c as any).timeline.push({
      at: new Date(),
      title: `Call logged by ${employee!.firstName} ${employee!.lastName}`,
      description: dto.summary,
      source,
    } as any);
    await c.save();
    return c.toObject();
  }

  async addMyCaseNote(
    tenantId: string,
    userId: string,
    caseId: string,
    dto: { note: string },
    caseType: 'adr' | 'litigation' = 'adr',
  ) {
    const { case: c, employee } = await this.getAuthorizedCase(
      tenantId,
      userId,
      caseId,
      'employee',
      caseType,
    );
    const source =
      caseType === 'adr'
        ? AdrTimelineSource.MANUAL
        : LitigationTimelineSource.MANUAL;
    (c as any).timeline.push({
      at: new Date(),
      title: `Note from ${employee!.firstName} ${employee!.lastName}`,
      description: dto.note,
      source,
    } as any);
    await c.save();
    return c.toObject();
  }
}

@Injectable()
export class MyTicketsService {
  constructor(
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly ticketService: TicketService,
  ) {}

  private async resolveEmployee(tenantId: string, userId: string) {
    const employee = await this.employeeModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      userId: new Types.ObjectId(userId),
    });
    if (!employee) {
      throw new NotFoundException(
        'No employee record is linked to this account',
      );
    }
    return employee;
  }

  async getMyTickets(tenantId: string, userId: string, status?: TicketStatus) {
    const employee = await this.resolveEmployee(tenantId, userId);
    return this.ticketService.getAll(tenantId, {
      agentUserId: String(employee._id),
      status,
    });
  }

  private async getOwnedTicket(
    tenantId: string,
    userId: string,
    ticketId: string,
  ) {
    const employee = await this.resolveEmployee(tenantId, userId);
    const ticket = await this.ticketService.getById(tenantId, ticketId);
    if (
      !ticket.agentUserId ||
      String(ticket.agentUserId) !== String(employee._id)
    ) {
      throw new ForbiddenException('This ticket is not assigned to you');
    }
    return ticket;
  }

  async getMyTicket(tenantId: string, userId: string, ticketId: string) {
    return this.getOwnedTicket(tenantId, userId, ticketId);
  }

  async setStatus(
    tenantId: string,
    userId: string,
    ticketId: string,
    dto: UpdateTicketStatusDto,
  ) {
    await this.getOwnedTicket(tenantId, userId, ticketId);
    return this.ticketService.setStatus(tenantId, ticketId, dto);
  }

  async addNote(
    tenantId: string,
    userId: string,
    ticketId: string,
    dto: AddTicketNoteDto,
  ) {
    await this.getOwnedTicket(tenantId, userId, ticketId);
    return this.ticketService.addNote(tenantId, ticketId, dto);
  }
}

@Injectable()
export class MyKbService {
  constructor(private readonly kbService: KbArticleService) {}

  // Internal + Published only — a draft internal article isn't
  // ready for the floor yet, and client-facing articles belong to a
  // different audience entirely.
  async getArticles(tenantId: string) {
    return this.kbService.getAll(tenantId, {
      audience: KbAudience.INTERNAL,
      status: KbStatus.PUBLISHED,
    });
  }

  async recordView(tenantId: string, id: string) {
    return this.kbService.recordView(tenantId, id);
  }

  async vote(tenantId: string, id: string, dto: VoteKbArticleDto) {
    return this.kbService.vote(tenantId, id, dto);
  }

  async suggest(tenantId: string, query: string, limit = 3) {
    return this.kbService.suggestArticles(
      tenantId,
      query,
      KbAudience.INTERNAL,
      limit,
    );
  }
}
