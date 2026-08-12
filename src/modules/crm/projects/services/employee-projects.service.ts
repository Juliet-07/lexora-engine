import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
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
} from '../schemas';
import { Employee, EmployeeDocument } from 'src/modules/hr/schemas';
import {
  UpdateMyTaskDto,
  CreateEmployeeMessageDto,
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
    private readonly workspaceService: MandateWorkspaceService,
    private readonly taskService: TaskService,
    private readonly timeEntryService: TimeEntryService,
  ) {}

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

  // "My mandates" means either of two things for a genuine employee,
  // not just one: my team is formally assigned to the mandate, OR I
  // personally have at least one task on it. A tenant-type caller
  // (the account owner, possibly also linked to an Employee record)
  // isn't subject to that restriction at all — they already have
  // full visibility on the tenant side, so scoping "my mandates" to
  // only their personal task/team links would just be a confusing,
  // narrower view of data they can already see everything of.
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

    const or: any[] = [{ _id: { $in: taskMandateIds } }];
    if (employee.teamId) or.push({ teamId: employee.teamId });

    const rows = await this.mandateModel
      .find({ tenantId: tId, $or: or })
      .sort({ createdAt: -1 })
      .lean();
    return rows.map((m) => this.normalizeMandate(m));
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
      return { employee, mandate };
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
    return { employee, mandate };
  }

  async getMandateDetail(
    tenantId: string,
    userId: string,
    mandateId: string,
    userType: string,
  ) {
    const { mandate } = await this.getAuthorizedMandate(
      tenantId,
      userId,
      mandateId,
      userType,
    );
    return this.normalizeMandate(mandate);
  }

  // Every task on the mandate, any assignee — the "Board" view.
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
    await this.getAuthorizedMandate(tenantId, userId, mandateId, userType);
    return this.taskService.getAll(tenantId, { mandateId });
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

  async logMyTime(tenantId: string, userId: string, dto: CreateMyTimeEntryDto) {
    const { employee, mandate } = await this.getAuthorizedMandate(
      tenantId,
      userId,
      dto.mandateId,
      'employee',
    );
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
