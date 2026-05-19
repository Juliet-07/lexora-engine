import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import {
  ClientProfileRecord,
  ClientProfileDocument,
} from '../../tenant/schemas/client-profile.schema';
import { RiskRule, RiskRuleDocument } from '../schemas/risk-rule.schema';
import { RiskScenario, RiskScenarioDocument } from '../schemas/risk-scenario.schema';
import { RiskOverride, RiskOverrideDocument } from '../schemas/risk-override.schema';
import {
  ComplianceAlert,
  ComplianceAlertDocument,
  AlertType,
  AlertSeverity,
  AlertStatus,
} from '../schemas/compliance-alert.schema';
import {
  CreateRiskRuleDto,
  UpdateRiskRuleDto,
  CreateRiskScenarioDto,
  OverrideRiskLevelDto,
  RiskEngineFilterDto,
} from '../dto/kyc.dto';
import { paginate, PaginationDto } from '../../../common/pagination.dto';
import { AccountStatus } from '../../../common/interfaces/user-role.enum';

@Injectable()
export class RiskEngineService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(ClientProfileRecord.name)
    private readonly profileModel: Model<ClientProfileDocument>,
    @InjectModel(RiskRule.name)
    private readonly ruleModel: Model<RiskRuleDocument>,
    @InjectModel(RiskScenario.name)
    private readonly scenarioModel: Model<RiskScenarioDocument>,
    @InjectModel(RiskOverride.name)
    private readonly overrideModel: Model<RiskOverrideDocument>,
    @InjectModel(ComplianceAlert.name)
    private readonly alertModel: Model<ComplianceAlertDocument>,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // RISK DASHBOARD
  // ═══════════════════════════════════════════════════════════

  async getRiskDashboard(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);

    const [breakdown, highRiskClients, overdueReviews, riskTrend, riskByRegion, topRiskFactors] =
      await Promise.all([
        // Risk level distribution
        this.profileModel.aggregate([
          { $match: { tenantId: tId } },
          { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
          { $unwind: '$user' },
          { $match: { 'user.status': { $ne: AccountStatus.INACTIVE } } },
          { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
        ]),

        // High + critical clients
        this.profileModel.aggregate([
          { $match: { tenantId: tId, riskLevel: { $in: ['high', 'critical'] } } },
          { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
          { $unwind: '$user' },
          { $match: { 'user.status': { $ne: AccountStatus.INACTIVE } } },
          {
            $project: {
              clientId: '$userId',
              fullName: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
              email: '$user.email',
              riskLevel: 1,
              kycStatus: 1,
              verificationCompletedAt: 1,
              classifications: 1,
            },
          },
          { $sort: { riskLevel: -1 } },
          { $limit: 5 },
        ]),

        // Overdue reviews (approved > 180 days ago)
        this.profileModel.aggregate([
          {
            $match: {
              tenantId: tId,
              kycStatus: 'approved',
              kycCompletedAt: { $lt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
            },
          },
          { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
          { $unwind: '$user' },
          {
            $project: {
              clientId: '$userId',
              fullName: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
              email: '$user.email',
              riskLevel: 1,
              kycCompletedAt: 1,
            },
          },
          { $limit: 5 },
        ]),

        // Risk trend — average verification score per month (last 6 months)
        this.profileModel.aggregate([
          {
            $match: {
              tenantId: tId,
              verificationCompletedAt: {
                $gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000),
              },
              'verificationResults.riskScore.score': { $exists: true },
            },
          },
          {
            $group: {
              _id: {
                year:  { $year:  '$verificationCompletedAt' },
                month: { $month: '$verificationCompletedAt' },
              },
              avgScore: { $avg: '$verificationResults.riskScore.score' },
              count:    { $sum: 1 },
            },
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } },
        ]),

        // Risk by region (client country)
        this.profileModel.aggregate([
          { $match: { tenantId: tId, 'address.country': { $ne: null } } },
          { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
          { $unwind: '$user' },
          { $match: { 'user.status': { $ne: AccountStatus.INACTIVE } } },
          {
            $group: {
              _id:      '$address.country',
              count:    { $sum: 1 },
              avgScore: { $avg: '$verificationResults.riskScore.score' },
            },
          },
          { $sort: { avgScore: -1 } },
          { $limit: 10 },
        ]),

        // Top risk factors from verification results
        this.profileModel.aggregate([
          {
            $match: {
              tenantId: tId,
              verificationResults: { $ne: null },
            },
          },
          {
            $project: {
              checks: { $objectToArray: '$verificationResults' },
            },
          },
          { $unwind: '$checks' },
          { $match: { 'checks.v.status': 'flagged' } },
          { $group: { _id: '$checks.k', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
        ]),
      ]);

    const riskMap = breakdown.reduce(
      (m, b) => ({ ...m, [b._id]: b.count }),
      {} as Record<string, number>,
    );
    const totalClients = breakdown.reduce((s, b) => s + b.count, 0);
    const avgScore = totalClients > 0
      ? Math.round(
          breakdown.reduce((s, b) => {
            const scoreMap: Record<string, number> = { critical: 85, high: 65, medium: 40, low: 15, unrated: 0 };
            return s + (scoreMap[b._id] ?? 0) * b.count;
          }, 0) / totalClients,
        )
      : 0;

    return {
      summary: {
        totalClients,
        critical: riskMap['critical'] ?? 0,
        high:     riskMap['high']     ?? 0,
        medium:   riskMap['medium']   ?? 0,
        low:      riskMap['low']      ?? 0,
        unrated:  riskMap['unrated']  ?? 0,
        avgRiskScore: avgScore,
      },
      breakdown,
      highRiskClients,
      overdueReviews,
      riskTrend,
      riskByRegion,
      topRiskFactors,
      generatedAt: new Date(),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // CLIENT RISK LIST
  // ═══════════════════════════════════════════════════════════

  async getClientRiskList(
    tenantId: string,
    pagination: PaginationDto,
    filters: RiskEngineFilterDto,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const { skip, limit, page } = pagination;

    const matchStage: any = { tenantId: tId };
    if (filters.riskLevel) matchStage.riskLevel = filters.riskLevel;

    const pipeline: any[] = [
      { $match: matchStage },
      { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $match: { 'user.status': { $ne: AccountStatus.INACTIVE } } },
      ...(filters.search
        ? [{
            $match: {
              $or: [
                { 'user.firstName': { $regex: filters.search, $options: 'i' } },
                { 'user.lastName':  { $regex: filters.search, $options: 'i' } },
                { 'user.email':     { $regex: filters.search, $options: 'i' } },
              ],
            },
          }]
        : []),
      {
        $project: {
          clientId:                '$userId',
          fullName:                { $concat: ['$user.firstName', ' ', '$user.lastName'] },
          email:                   '$user.email',
          riskLevel:               1,
          kycStatus:               1,
          classifications:         1,
          verificationCompletedAt: 1,
          verificationResults:     1,
          kycCompletedAt:          1,
          'address.country':       1,
        },
      },
      { $sort: { riskLevel: -1, createdAt: -1 } },
    ];

    const [items, countResult] = await Promise.all([
      this.profileModel.aggregate([...pipeline, { $skip: skip }, { $limit: limit }]),
      this.profileModel.aggregate([...pipeline, { $count: 'total' }]),
    ]);

    return paginate(items, countResult[0]?.total || 0, page, limit);
  }

  // ═══════════════════════════════════════════════════════════
  // RISK RULES — tenant sees both global (superadmin) + own
  // ═══════════════════════════════════════════════════════════

  async getRules(tenantId: string) {
    // Return global rules (tenantId = null) + this tenant's own rules
    return this.ruleModel
      .find({
        $or: [
          { tenantId: null },
          { tenantId: new Types.ObjectId(tenantId) },
        ],
        isActive: true,
      })
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();
  }

  async createRule(tenantId: string, createdBy: string, dto: CreateRiskRuleDto) {
    return this.ruleModel.create({
      ...dto,
      tenantId:  new Types.ObjectId(tenantId),
      createdBy: new Types.ObjectId(createdBy),
    });
  }

  async updateRule(ruleId: string, tenantId: string, dto: UpdateRiskRuleDto) {
    const rule = await this.ruleModel.findOneAndUpdate(
      { _id: ruleId, tenantId: new Types.ObjectId(tenantId) }, // can only edit own rules
      { $set: dto },
      { new: true },
    );
    if (!rule) throw new NotFoundException('Rule not found or not editable');
    return rule;
  }

  async deleteRule(ruleId: string, tenantId: string) {
    const rule = await this.ruleModel.findOneAndDelete({
      _id:      ruleId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!rule) throw new NotFoundException('Rule not found or not deletable');
  }

  // ═══════════════════════════════════════════════════════════
  // SCENARIO BUILDER
  // ═══════════════════════════════════════════════════════════

  async getScenarios(tenantId: string) {
    return this.scenarioModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .populate('ruleIds', 'name field condition value action ruleType')
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();
  }

  async createScenario(tenantId: string, createdBy: string, dto: CreateRiskScenarioDto) {
    // Validate all rule IDs exist and are accessible by this tenant
    const accessibleRules = await this.ruleModel.find({
      _id: { $in: dto.ruleIds },
      $or: [
        { tenantId: null },
        { tenantId: new Types.ObjectId(tenantId) },
      ],
    }).lean();

    if (accessibleRules.length !== dto.ruleIds.length) {
      throw new NotFoundException('One or more rule IDs are invalid or inaccessible');
    }

    return this.scenarioModel.create({
      ...dto,
      ruleIds:   dto.ruleIds.map((id) => new Types.ObjectId(id)),
      tenantId:  new Types.ObjectId(tenantId),
      createdBy: new Types.ObjectId(createdBy),
    });
  }

  async updateScenario(scenarioId: string, tenantId: string, dto: Partial<CreateRiskScenarioDto>) {
    const scenario = await this.scenarioModel.findOneAndUpdate(
      { _id: scenarioId, tenantId: new Types.ObjectId(tenantId) },
      { $set: dto },
      { new: true },
    );
    if (!scenario) throw new NotFoundException('Scenario not found');
    return scenario;
  }

  async deleteScenario(scenarioId: string, tenantId: string) {
    const scenario = await this.scenarioModel.findOneAndDelete({
      _id:      scenarioId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!scenario) throw new NotFoundException('Scenario not found');
  }

  // ═══════════════════════════════════════════════════════════
  // OVERRIDE RISK LEVEL
  // ═══════════════════════════════════════════════════════════

  async overrideRiskLevel(
    clientId: string,
    tenantId: string,
    officerId: string,
    dto: OverrideRiskLevelDto,
  ) {
    const profile = await this.profileModel.findOne({
      userId:   new Types.ObjectId(clientId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!profile) throw new NotFoundException('Client profile not found');

    const previousLevel = profile.riskLevel;

    await this.overrideModel.findOneAndUpdate(
      { clientId: new Types.ObjectId(clientId) },
      {
        tenantId:            new Types.ObjectId(tenantId),
        clientId:            new Types.ObjectId(clientId),
        overriddenRiskLevel: dto.riskLevel,
        reason:              dto.reason,
        overriddenBy:        new Types.ObjectId(officerId),
        expiresAt:           dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      { upsert: true, new: true },
    );

    await this.profileModel.findOneAndUpdate(
      { userId: new Types.ObjectId(clientId) },
      {
        riskLevel: dto.riskLevel,
        $push: {
          'metadata.auditTrail': {
            action:        'risk_level_overridden',
            performedBy:   officerId,
            previousLevel,
            newLevel:      dto.riskLevel,
            reason:        dto.reason,
            timestamp:     new Date(),
          },
        },
      },
    );

    if (['high', 'critical'].includes(dto.riskLevel)) {
      await this.alertModel.create({
        tenantId:    new Types.ObjectId(tenantId),
        clientId:    new Types.ObjectId(clientId),
        type:        AlertType.HIGH_RISK_CLIENT,
        severity:    dto.riskLevel === 'critical' ? AlertSeverity.CRITICAL : AlertSeverity.HIGH,
        status:      AlertStatus.OPEN,
        title:       `Risk level manually set to ${dto.riskLevel.toUpperCase()}`,
        description: `Overridden from ${previousLevel} to ${dto.riskLevel}. Reason: ${dto.reason}`,
        metadata:    { previousLevel, officerId },
      });
    }

    return { success: true, previousLevel, newLevel: dto.riskLevel };
  }

  async getRiskOverride(clientId: string, tenantId: string) {
    return this.overrideModel
      .findOne({
        clientId: new Types.ObjectId(clientId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .populate('overriddenBy', 'firstName lastName email')
      .lean();
  }

  // ═══════════════════════════════════════════════════════════
  // GENERATE ALERTS FROM VERIFICATION RESULTS
  // ═══════════════════════════════════════════════════════════

  async generateAlertsFromVerification(
    clientId: string,
    tenantId: string,
    verificationResults: Record<string, any>,
  ) {
    const checkAlertMap: Record<string, { type: AlertType; severity: AlertSeverity; title: string }> = {
      sanctions:    { type: AlertType.SANCTIONS_HIT,    severity: AlertSeverity.CRITICAL, title: 'Sanctions match detected'           },
      pep:          { type: AlertType.PEP_MATCH,         severity: AlertSeverity.HIGH,     title: 'PEP database match found'           },
      adverseMedia: { type: AlertType.ADVERSE_MEDIA,     severity: AlertSeverity.MEDIUM,   title: 'Adverse media screening hit'        },
      ubo:          { type: AlertType.UBO_FLAGGED,       severity: AlertSeverity.HIGH,     title: 'UBO / director flagged in screening' },
    };

    let created = 0;
    for (const [checkKey, alertDef] of Object.entries(checkAlertMap)) {
      const result = verificationResults[checkKey];
      if (result?.status === 'flagged') {
        const existing = await this.alertModel.findOne({
          tenantId: new Types.ObjectId(tenantId),
          clientId: new Types.ObjectId(clientId),
          type:     alertDef.type,
          status:   AlertStatus.OPEN,
        });
        if (!existing) {
          await this.alertModel.create({
            tenantId:    new Types.ObjectId(tenantId),
            clientId:    new Types.ObjectId(clientId),
            type:        alertDef.type,
            severity:    alertDef.severity,
            status:      AlertStatus.OPEN,
            title:       alertDef.title,
            description: result.detail || result.result || 'Flagged during verification',
            metadata:    { matches: result.matches ?? [], ranAt: result.ranAt },
          });
          created++;
        }
      }
    }
    return created;
  }
}
