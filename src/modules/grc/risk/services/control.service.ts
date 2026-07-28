import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Control,
  ControlDocument,
  ControlTest,
  ControlTestDocument,
  TestStatus,
  TestConclusion,
  FREQUENCY_BY_RATING,
  Deficiency,
  DeficiencyDocument,
  DeficiencyOrigin,
  Severity,
  DefStatus,
  REMEDIATION_DAYS,
} from '../schemas';
import { Risk, RiskDocument } from '../schemas';
import { RiskCategory } from '../schemas';
import {
  CreateControlDto,
  CreateTestDto,
  UpdateTestDto,
  AssignTestDto,
  CompleteTestDto,
  SignOffTestDto,
  CreateDeficiencyDto,
  UpdateDeficiencyDto,
  ValidateDeficiencyDto,
} from '../dtos';

// ═══════════════════════════════════════════════════════════
// CONTROL LIBRARY
// ═══════════════════════════════════════════════════════════

@Injectable()
export class ControlService {
  constructor(
    @InjectModel(Control.name)
    private readonly controlModel: Model<ControlDocument>,
    @InjectModel(Risk.name) private readonly riskModel: Model<RiskDocument>,
  ) {}

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

  // Real linked-risk count per control — a reverse lookup against the
  // Risk collection, computed fresh on every read rather than stored.
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
}

// ═══════════════════════════════════════════════════════════
// DEFICIENCIES — defined before TestPlanService since it depends
// on this class for the auto-create-on-fail logic below.
// ═══════════════════════════════════════════════════════════

@Injectable()
export class DeficiencyService {
  constructor(
    @InjectModel(Deficiency.name)
    private readonly model: Model<DeficiencyDocument>,
  ) {}

  private async nextReference(tenantId: string): Promise<string> {
    const count = await this.model.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
    });
    return `DEF-${String(count + 1).padStart(3, '0')}`;
  }

  async create(tenantId: string, dto: CreateDeficiencyDto) {
    const reference = await this.nextReference(tenantId);
    const loggedAt = new Date();
    const deadline = new Date(
      loggedAt.getTime() + REMEDIATION_DAYS[dto.severity] * 86400000,
    );
    return this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      reference,
      title: dto.title,
      origin: dto.origin,
      sourceRef: dto.sourceRef ?? '',
      category: dto.category,
      severity: dto.severity,
      rootCause: dto.rootCause ?? '',
      owner: dto.owner ?? '',
      loggedAt,
      deadline,
      plan: '',
      managementResponse: '',
      evidence: [],
      validatedBy: '',
      validatedAt: null,
      status: DefStatus.OPEN,
    });
  }

  // Called internally by TestPlanService on a failed test — category
  // hardcoded to Operational, matching the original design exactly
  // (a known quirk, not something invented here).
  async createFromTest(
    tenantId: string,
    data: {
      controlCode: string;
      controlName: string;
      findings: string;
      severity: Severity;
    },
  ) {
    return this.create(tenantId, {
      title: `Control failure — ${data.controlName}`,
      origin: DeficiencyOrigin.CONTROL_TEST,
      sourceRef: `${data.controlCode} test failure`,
      category: RiskCategory.OPERATIONAL,
      severity: data.severity,
      rootCause: data.findings,
    });
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ loggedAt: -1 })
      .lean();
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<DeficiencyDocument> {
    const d = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!d) throw new NotFoundException('Deficiency not found');
    return d;
  }

  // Severity changes recompute the deadline from the ORIGINAL logged
  // date, not from today — matches the original design exactly.
  async update(tenantId: string, id: string, dto: UpdateDeficiencyDto) {
    const d = await this.getRawDoc(tenantId, id);
    if (dto.severity !== undefined && dto.severity !== d.severity) {
      d.severity = dto.severity;
      d.deadline = new Date(
        d.loggedAt.getTime() + REMEDIATION_DAYS[dto.severity] * 86400000,
      );
    }
    if (dto.status !== undefined) d.status = dto.status;
    if (dto.owner !== undefined) d.owner = dto.owner;
    if (dto.rootCause !== undefined) d.rootCause = dto.rootCause;
    if (dto.plan !== undefined) {
      d.plan = dto.plan;
      if (d.status === DefStatus.OPEN) d.status = DefStatus.PLAN_AGREED;
    }
    if (dto.managementResponse !== undefined)
      d.managementResponse = dto.managementResponse;
    await d.save();
    return d;
  }

  // Uploading evidence bumps to Awaiting validation, unless already
  // Closed — matches the original design exactly.
  async addEvidence(
    tenantId: string,
    id: string,
    files: Express.Multer.File[],
  ) {
    const d = await this.getRawDoc(tenantId, id);
    for (const file of files) {
      d.evidence.push({
        name: file.originalname,
        fileUrl: `/uploads/grc/risk/deficiencies/${file.filename}`,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
      } as any);
    }
    if (d.status !== DefStatus.CLOSED) d.status = DefStatus.AWAITING_VALIDATION;
    d.markModified('evidence');
    await d.save();
    return d;
  }

  async validate(tenantId: string, id: string, dto: ValidateDeficiencyDto) {
    const d = await this.getRawDoc(tenantId, id);
    d.validatedBy = dto.validatedBy;
    d.validatedAt = new Date();
    d.status = DefStatus.CLOSED;
    await d.save();
    return d;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.model.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Deficiency not found');
  }
}

// ═══════════════════════════════════════════════════════════
// TEST PLAN
// ═══════════════════════════════════════════════════════════

@Injectable()
export class TestPlanService {
  constructor(
    @InjectModel(ControlTest.name)
    private readonly model: Model<ControlTestDocument>,
    @InjectModel(Control.name)
    private readonly controlModel: Model<ControlDocument>,
    private readonly deficiencyService: DeficiencyService,
  ) {}

  async create(tenantId: string, dto: CreateTestDto) {
    const control = await this.controlModel
      .findOne({ _id: dto.controlId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!control) throw new NotFoundException('Control not found');
    return this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      controlId: control._id,
      controlCode: control.code,
      controlName: control.name,
      riskRating: dto.riskRating,
      frequency: FREQUENCY_BY_RATING[dto.riskRating],
      procedure: dto.procedure ?? '',
      year: new Date().getFullYear(),
      dueDate: new Date(dto.dueDate),
      tester: dto.tester ?? '',
      status: dto.tester ? TestStatus.ASSIGNED : TestStatus.PLANNED,
      conclusion: null,
      findings: '',
      evidence: [],
      signedOffBy: '',
      signedOffAt: null,
      completedAt: null,
    });
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ dueDate: 1 })
      .lean();
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<ControlTestDocument> {
    const test = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  async update(tenantId: string, id: string, dto: UpdateTestDto) {
    const test = await this.getRawDoc(tenantId, id);
    if (dto.procedure !== undefined) test.procedure = dto.procedure;
    if (dto.dueDate !== undefined) test.dueDate = new Date(dto.dueDate);
    await test.save();
    return test;
  }

  async assign(tenantId: string, id: string, dto: AssignTestDto) {
    const test = await this.getRawDoc(tenantId, id);
    test.tester = dto.tester;
    test.dueDate = new Date(dto.dueDate);
    test.status = TestStatus.ASSIGNED;
    await test.save();
    return test;
  }

  async addEvidence(
    tenantId: string,
    id: string,
    files: Express.Multer.File[],
  ) {
    const test = await this.getRawDoc(tenantId, id);
    for (const file of files) {
      test.evidence.push({
        name: file.originalname,
        fileUrl: `/uploads/grc/risk/tests/${file.filename}`,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
      } as any);
    }
    test.markModified('evidence');
    await test.save();
    return test;
  }

  // A Fail conclusion automatically logs a deficiency.
  async complete(tenantId: string, id: string, dto: CompleteTestDto) {
    const test = await this.getRawDoc(tenantId, id);
    test.conclusion = dto.conclusion;
    test.findings = dto.findings;
    test.status = TestStatus.AWAITING_SIGNOFF;
    test.completedAt = new Date();
    await test.save();

    if (dto.conclusion === TestConclusion.FAIL) {
      if (!dto.severity)
        throw new BadRequestException(
          'A severity is required when recording a failed test.',
        );
      await this.deficiencyService.createFromTest(tenantId, {
        controlCode: test.controlCode,
        controlName: test.controlName,
        findings: dto.findings,
        severity: dto.severity,
      });
    }
    return test;
  }

  async signOff(tenantId: string, id: string, dto: SignOffTestDto) {
    const test = await this.getRawDoc(tenantId, id);
    test.signedOffBy = dto.signedOffBy;
    test.signedOffAt = new Date();
    test.status = TestStatus.SIGNED_OFF;
    await test.save();
    return test;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.model.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Test not found');
  }
}
