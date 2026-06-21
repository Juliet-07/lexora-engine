import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Requisition,
  RequisitionDocument,
  RequisitionStatus,
} from '../schemas/requisition.schema';
import { Employee, EmployeeDocument } from '../schemas/employee.schema';
import { RequisitionTypeService } from './requisition-type.service';
import {
  CreateRequisitionDto,
  ReviewRequisitionDto,
} from '../dtos/requisition.dto';

@Injectable()
export class RequisitionService {
  constructor(
    @InjectModel(Requisition.name)
    private readonly requisitionModel: Model<RequisitionDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly typeService: RequisitionTypeService,
  ) {}

  async createForEmployee(
    tenantId: string,
    employeeId: string,
    dto: CreateRequisitionDto,
  ): Promise<RequisitionDocument> {
    const employee = await this.employeeModel.findOne({
      _id: employeeId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const typeList = await this.typeService.getOrCreate(tenantId);
    const matchedType = typeList.items.find((t) => t.key === dto.typeKey);
    if (!matchedType) {
      throw new BadRequestException(
        `"${dto.typeKey}" is not a valid requisition type for this tenant.`,
      );
    }

    const teamName =
      employee.teamId && typeof employee.teamId === 'object'
        ? (employee.teamId as any).name
        : null;

    return this.requisitionModel.create({
      tenantId: new Types.ObjectId(tenantId),
      employeeId: employee._id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      department: teamName,
      typeKey: matchedType.key,
      typeLabel: matchedType.label,
      title: dto.title,
      amount: dto.amount ?? null,
      currency: dto.currency ?? null,
      priority: dto.priority ?? 'medium',
      justification: dto.justification ?? null,
      status: RequisitionStatus.SUBMITTED,
    });
  }

  async getMyRequisitions(employeeId: string): Promise<RequisitionDocument[]> {
    return this.requisitionModel
      .find({ employeeId: new Types.ObjectId(employeeId) })
      .sort({ createdAt: -1 })
      .lean() as any;
  }

  async getOneForEmployee(
    requisitionId: string,
    employeeId: string,
  ): Promise<RequisitionDocument> {
    const requisition = await this.requisitionModel.findOne({
      _id: requisitionId,
      employeeId: new Types.ObjectId(employeeId),
    });
    if (!requisition) throw new NotFoundException('Requisition not found');
    return requisition;
  }

  async getAll(
    tenantId: string,
    status?: string,
  ): Promise<RequisitionDocument[]> {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (status) query.status = status;
    return this.requisitionModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean() as any;
  }

  async getById(
    tenantId: string,
    requisitionId: string,
  ): Promise<RequisitionDocument> {
    const requisition = await this.requisitionModel.findOne({
      _id: requisitionId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!requisition) throw new NotFoundException('Requisition not found');
    return requisition;
  }

  // Single-step approval — one decision resolves the request, no
  // separate Manager/Finance stages, per the agreed design.
  async review(
    tenantId: string,
    requisitionId: string,
    reviewerId: string,
    dto: ReviewRequisitionDto,
  ): Promise<RequisitionDocument> {
    const requisition = await this.getById(tenantId, requisitionId);

    if (requisition.status !== RequisitionStatus.SUBMITTED) {
      throw new ConflictException(
        'This requisition has already been reviewed.',
      );
    }

    requisition.status =
      dto.decision === 'approved'
        ? RequisitionStatus.APPROVED
        : RequisitionStatus.REJECTED;
    requisition.reviewedBy = new Types.ObjectId(reviewerId);
    requisition.reviewedAt = new Date();
    requisition.reviewNote = dto.reviewNote ?? null;

    await requisition.save();
    return requisition;
  }

  async markFulfilled(
    tenantId: string,
    requisitionId: string,
  ): Promise<RequisitionDocument> {
    const requisition = await this.getById(tenantId, requisitionId);

    if (requisition.status !== RequisitionStatus.APPROVED) {
      throw new ConflictException(
        'Only approved requisitions can be marked as fulfilled.',
      );
    }

    requisition.status = RequisitionStatus.FULFILLED;
    requisition.fulfilledAt = new Date();
    await requisition.save();
    return requisition;
  }
}
