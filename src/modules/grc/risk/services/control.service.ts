import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Control,
  ControlDocument,
  ControlTest,
  ControlTestDocument,
  Deficiency,
  DeficiencyDocument,
  DeficiencySeverity,
  DeficiencyStatus,
} from '../schemas';
import { Risk, RiskDocument } from '../schemas';
import { CreateControlDto, LogTestDto, LogDeficiencyDto } from '../dtos';

const REMEDIATION_DEADLINE_DAYS: Record<DeficiencySeverity, number> = {
  [DeficiencySeverity.CRITICAL]: 30,
  [DeficiencySeverity.HIGH]: 60,
  [DeficiencySeverity.MEDIUM]: 90,
  [DeficiencySeverity.LOW]: 180,
};

@Injectable()
export class ControlService {
  constructor(
    @InjectModel(Control.name)
    private readonly controlModel: Model<ControlDocument>,
    @InjectModel(ControlTest.name)
    private readonly testModel: Model<ControlTestDocument>,
    @InjectModel(Deficiency.name)
    private readonly deficiencyModel: Model<DeficiencyDocument>,
    @InjectModel(Risk.name) private readonly riskModel: Model<RiskDocument>,
  ) {}

  remediationDeadlineDays(severity: DeficiencySeverity): number {
    return REMEDIATION_DEADLINE_DAYS[severity];
  }

  async create(tenantId: string, dto: CreateControlDto) {
    return this.controlModel.create({
      tenantId: new Types.ObjectId(tenantId),
      code: dto.code,
      name: dto.name,
      objective: dto.objective ?? '',
      type: dto.type,
      owner: dto.owner ?? '',
      frequency: dto.frequency,
    });
  }

  // Real linked-risk count per control — the same reverse lookup the
  // mock computed client-side, now done server-side against real data.
  async getAll(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const controls = await this.controlModel
      .find({ tenantId: tId })
      .sort({ createdAt: -1 })
      .lean();
    const risks = await this.riskModel
      .find({ tenantId: tId })
      .select('controls')
      .lean();
    return controls.map((c) => ({
      ...c,
      linkedRiskCount: risks.filter((r) =>
        r.controls.some(
          (x: any) => x.controlId.toString() === c._id.toString(),
        ),
      ).length,
    }));
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<ControlDocument> {
    const control = await this.controlModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!control) throw new NotFoundException('Control not found');
    return control;
  }

  async logTest(tenantId: string, controlId: string, dto: LogTestDto) {
    await this.getRawDoc(tenantId, controlId); // 404s if not found/not owned
    return this.testModel.create({
      tenantId: new Types.ObjectId(tenantId),
      controlId: new Types.ObjectId(controlId),
      testedAt: new Date(),
      outcome: dto.outcome,
      effectiveness: dto.effectiveness,
      notes: dto.notes ?? '',
    });
  }

  async getAllTests(tenantId: string) {
    return this.testModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ testedAt: -1 })
      .lean();
  }

  // Deliberately standalone — not auto-created from a failed test,
  // matching the tenant's own independent "Log deficiency" action.
  async logDeficiency(
    tenantId: string,
    controlId: string,
    dto: LogDeficiencyDto,
  ) {
    await this.getRawDoc(tenantId, controlId);
    const deadline = new Date(
      Date.now() + this.remediationDeadlineDays(dto.severity) * 86400000,
    );
    return this.deficiencyModel.create({
      tenantId: new Types.ObjectId(tenantId),
      controlId: new Types.ObjectId(controlId),
      severity: dto.severity,
      rootCause: dto.rootCause,
      remediationDeadline: deadline,
      status: DeficiencyStatus.OPEN,
      openedAt: new Date(),
    });
  }

  async getAllDeficiencies(tenantId: string) {
    return this.deficiencyModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ openedAt: -1 })
      .lean();
  }

  async markRemediated(tenantId: string, deficiencyId: string) {
    const deficiency = await this.deficiencyModel.findOne({
      _id: deficiencyId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deficiency) throw new NotFoundException('Deficiency not found');
    deficiency.status = DeficiencyStatus.REMEDIATED;
    deficiency.remediatedAt = new Date();
    await deficiency.save();
    return deficiency;
  }
}
