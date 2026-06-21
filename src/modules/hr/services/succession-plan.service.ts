import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SuccessionPlan,
  SuccessionPlanDocument,
  Employee,
  EmployeeDocument,
} from '../schemas';
import {
  CreateSuccessionPlanDto,
  UpdateSuccessionPlanDto,
  AddSuccessorDto,
} from '../dtos';

@Injectable()
export class SuccessionPlanService {
  constructor(
    @InjectModel(SuccessionPlan.name)
    private readonly planModel: Model<SuccessionPlanDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  async getAll(tenantId: string): Promise<SuccessionPlanDocument[]> {
    return this.planModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean() as any;
  }

  async getById(
    tenantId: string,
    planId: string,
  ): Promise<SuccessionPlanDocument> {
    const plan = await this.planModel.findOne({
      _id: planId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!plan) throw new NotFoundException('Succession plan not found');
    return plan;
  }

  async create(
    tenantId: string,
    dto: CreateSuccessionPlanDto,
  ): Promise<SuccessionPlanDocument> {
    const incumbent = await this.employeeModel.findOne({
      _id: dto.incumbentId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!incumbent)
      throw new BadRequestException('Incumbent employee not found.');

    return this.planModel.create({
      tenantId: new Types.ObjectId(tenantId),
      criticalRole: dto.criticalRole,
      incumbentId: incumbent._id,
      incumbentName: `${incumbent.firstName} ${incumbent.lastName}`,
      riskOfLoss: dto.riskOfLoss ?? 'medium',
      overallReadiness: dto.overallReadiness ?? 'gap',
      notes: dto.notes ?? null,
      successors: [],
    });
  }

  async update(
    tenantId: string,
    planId: string,
    dto: UpdateSuccessionPlanDto,
  ): Promise<SuccessionPlanDocument> {
    const plan = await this.getById(tenantId, planId);
    if (dto.criticalRole !== undefined) plan.criticalRole = dto.criticalRole;
    if (dto.riskOfLoss !== undefined) plan.riskOfLoss = dto.riskOfLoss as any;
    if (dto.overallReadiness !== undefined)
      plan.overallReadiness = dto.overallReadiness as any;
    if (dto.notes !== undefined) plan.notes = dto.notes;
    await plan.save();
    return plan;
  }

  async delete(tenantId: string, planId: string): Promise<void> {
    const deleted = await this.planModel.findOneAndDelete({
      _id: planId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Succession plan not found');
  }

  async addSuccessor(
    tenantId: string,
    planId: string,
    dto: AddSuccessorDto,
  ): Promise<SuccessionPlanDocument> {
    const plan = await this.getById(tenantId, planId);

    const employee = await this.employeeModel.findOne({
      _id: dto.employeeId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!employee) throw new BadRequestException('Employee not found.');

    if (
      plan.successors.some((s) => s.employeeId.toString() === dto.employeeId)
    ) {
      throw new BadRequestException(
        'This employee is already listed as a successor on this plan.',
      );
    }

    plan.successors.push({
      employeeId: employee._id as any,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      readiness: (dto.readiness as any) ?? 'gap',
      potential: (dto.potential as any) ?? 'medium',
      notes: dto.notes ?? null,
    });

    await plan.save();
    return plan;
  }

  async removeSuccessor(
    tenantId: string,
    planId: string,
    employeeId: string,
  ): Promise<SuccessionPlanDocument> {
    const plan = await this.getById(tenantId, planId);
    plan.successors = plan.successors.filter(
      (s) => s.employeeId.toString() !== employeeId,
    );
    await plan.save();
    return plan;
  }
}
