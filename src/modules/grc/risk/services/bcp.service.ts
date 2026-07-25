import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BcpPlan,
  BcpPlanDocument,
  BcpTest,
  BcpTestDocument,
  RtoRpo,
  RtoRpoDocument,
  CrisisContact,
  CrisisContactDocument,
} from '../schemas';
import {
  CreateBcpPlanDto,
  LogBcpTestDto,
  CreateRtoRpoDto,
  CreateCrisisContactDto,
} from '../dtos';

@Injectable()
export class BcpService {
  constructor(
    @InjectModel(BcpPlan.name)
    private readonly planModel: Model<BcpPlanDocument>,
    @InjectModel(BcpTest.name)
    private readonly testModel: Model<BcpTestDocument>,
    @InjectModel(RtoRpo.name)
    private readonly rtoRpoModel: Model<RtoRpoDocument>,
    @InjectModel(CrisisContact.name)
    private readonly contactModel: Model<CrisisContactDocument>,
  ) {}

  async createPlan(tenantId: string, dto: CreateBcpPlanDto) {
    return this.planModel.create({
      tenantId: new Types.ObjectId(tenantId),
      ...dto,
    });
  }
  async getAllPlans(tenantId: string) {
    return this.planModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async logTest(tenantId: string, dto: LogBcpTestDto) {
    return this.testModel.create({
      tenantId: new Types.ObjectId(tenantId),
      planId: new Types.ObjectId(dto.planId),
      testedAt: new Date(),
      outcome: dto.outcome,
      notes: dto.notes,
    });
  }
  async getAllTests(tenantId: string) {
    return this.testModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ testedAt: -1 })
      .lean();
  }

  async createRtoRpo(tenantId: string, dto: CreateRtoRpoDto) {
    return this.rtoRpoModel.create({
      tenantId: new Types.ObjectId(tenantId),
      ...dto,
    });
  }
  async getAllRtoRpo(tenantId: string) {
    return this.rtoRpoModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async createContact(tenantId: string, dto: CreateCrisisContactDto) {
    return this.contactModel.create({
      tenantId: new Types.ObjectId(tenantId),
      ...dto,
    });
  }
  async getAllContacts(tenantId: string) {
    return this.contactModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ escalationOrder: 1 })
      .lean();
  }
}
