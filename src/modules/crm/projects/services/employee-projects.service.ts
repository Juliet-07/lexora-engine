import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Mandate, MandateDocument_, Task, TaskDocument_ } from '../schemas';
import { Employee, EmployeeDocument } from 'src/modules/hr/schemas';
import { UpdateMyTaskDto } from '../dtos';
import { MandateWorkspaceService } from './mandate-workspace.service';

@Injectable()
export class MyProjectsService {
  constructor(
    @InjectModel(Mandate.name)
    private readonly mandateModel: Model<MandateDocument_>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument_>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly workspaceService: MandateWorkspaceService,
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

  // "My mandates" means either of two things, not just one: my
  // team is formally assigned to the mandate, OR I personally have
  // at least one task on it. The tenant can assign work either way —
  // picking a team up front, or assigning specific tasks to specific
  // people without ever setting the mandate's team — and an employee
  // needs to see the mandate either way.
  async getMyMandates(tenantId: string, userId: string) {
    const employee = await this.resolveEmployee(tenantId, userId);
    const tId = new Types.ObjectId(tenantId);

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

  // Same either/or logic as getMyMandates — team membership OR a
  // real task on this specific mandate.
  private async getAuthorizedMandate(
    tenantId: string,
    userId: string,
    mandateId: string,
  ) {
    const employee = await this.resolveEmployee(tenantId, userId);
    const tId = new Types.ObjectId(tenantId);
    const mandate = await this.mandateModel
      .findOne({ _id: mandateId, tenantId: tId })
      .lean();
    if (!mandate) throw new NotFoundException('Mandate not found');

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

  async getMandateDetail(tenantId: string, userId: string, mandateId: string) {
    const { mandate } = await this.getAuthorizedMandate(
      tenantId,
      userId,
      mandateId,
    );
    return this.normalizeMandate(mandate);
  }

  // Every task on the mandate, any assignee — the "Board" view.
  async getMandateTasks(tenantId: string, userId: string, mandateId: string) {
    await this.getAuthorizedMandate(tenantId, userId, mandateId);
    return this.taskModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        mandateId: new Types.ObjectId(mandateId),
      })
      .sort({ createdAt: -1 })
      .lean();
  }

  // Read-only access to the mandate's real documents — reuses the
  // same tenant-side service and data, just gated by team membership
  // instead of UserType.TENANT.
  async getMandateDocuments(
    tenantId: string,
    userId: string,
    mandateId: string,
  ) {
    await this.getAuthorizedMandate(tenantId, userId, mandateId);
    return this.workspaceService.getDocuments(tenantId, mandateId);
  }

  // Just this employee's own tasks — across every mandate, or one
  // mandate if given. The "My Tasks" view.
  async getMyTasks(tenantId: string, userId: string, mandateId?: string) {
    const employee = await this.resolveEmployee(tenantId, userId);
    const query: any = {
      tenantId: new Types.ObjectId(tenantId),
      assigneeUserId: employee._id,
    };
    if (mandateId) query.mandateId = new Types.ObjectId(mandateId);
    return this.taskModel.find(query).sort({ createdAt: -1 }).lean();
  }

  // An employee can move their own task's status and log hours —
  // nothing else, and only on tasks genuinely assigned to them.
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
    if (dto.status !== undefined) task.status = dto.status;
    if (dto.loggedHrs !== undefined) task.loggedHrs = dto.loggedHrs;
    await task.save();
    return task.toObject();
  }
}
