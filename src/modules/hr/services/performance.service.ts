import { ScoredKpiLine, ScoredFrameworkLine } from '../schemas';
import { InjectModel } from '@nestjs/mongoose';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Model, Types } from 'mongoose';
import {
  KpiTemplate,
  KpiTemplateDocument,
  CompetencyFramework,
  CompetencyFrameworkDocument,
  ValuesFramework,
  ValuesFrameworkDocument,
  DEFAULT_COMPETENCIES,
  DEFAULT_VALUES,
} from '../schemas';
import { UpsertKpiTemplateDto, UpdateFrameworkDto } from '../dtos';

export interface KpiScoreResult {
  key: string;
  title: string;
  weight: number;
  employeeScore: number | null;
  managerScore: number | null;
  combinedAverage: number | null;
  weightedScore: number | null;
}

export interface FrameworkScoreResult {
  key: string;
  title: string;
  employeeScore: number | null;
  managerScore: number | null;
  combinedAverage: number | null;
  divergent: boolean;
}

export interface KpiSectionResult {
  lines: KpiScoreResult[];
  employeeAverage: number | null;
  managerAverage: number | null;
  totalWeightedScore: number | null;
  ratingBand: string;
}

export interface FrameworkSectionResult {
  lines: FrameworkScoreResult[];
  overallScore: number | null;
  ratingBand: string;
}

@Injectable()
export class PerformanceScoringService {
  scoreKpiSection(kpis: ScoredKpiLine[]): KpiSectionResult {
    const lines: KpiScoreResult[] = kpis.map((k) => {
      const combinedAverage = this.combine(k.employeeScore, k.managerScore);
      const weightedScore =
        combinedAverage === null
          ? null
          : round2((combinedAverage / 5) * k.weight * 100);
      return {
        key: k.key,
        title: k.title,
        weight: k.weight,
        employeeScore: k.employeeScore,
        managerScore: k.managerScore,
        combinedAverage,
        weightedScore,
      };
    });

    const employeeScores = kpis
      .map((k) => k.employeeScore)
      .filter((s): s is number => s != null);
    const managerScores = kpis
      .map((k) => k.managerScore)
      .filter((s): s is number => s != null);

    const employeeAverage = employeeScores.length
      ? round2(avg(employeeScores))
      : null;
    const managerAverage = managerScores.length
      ? round2(avg(managerScores))
      : null;

    const weightedValues = lines
      .map((l) => l.weightedScore)
      .filter((s): s is number => s != null);
    const isComplete =
      weightedValues.length === lines.length && lines.length > 0;
    const totalWeightedScore = isComplete
      ? round2(weightedValues.reduce((s, v) => s + v, 0))
      : null;

    return {
      lines,
      employeeAverage,
      managerAverage,
      totalWeightedScore,
      ratingBand: this.kpiRatingBand(totalWeightedScore),
    };
  }

  scoreFrameworkSection(items: ScoredFrameworkLine[]): FrameworkSectionResult {
    const lines: FrameworkScoreResult[] = items.map((i) => {
      const combinedAverage = this.combine(i.employeeScore, i.managerScore);
      const divergent =
        i.employeeScore != null && i.managerScore != null
          ? Math.abs(i.employeeScore - i.managerScore) >= 2
          : false;
      return {
        key: i.key,
        title: i.title,
        employeeScore: i.employeeScore,
        managerScore: i.managerScore,
        combinedAverage,
        divergent,
      };
    });

    const combinedValues = lines
      .map((l) => l.combinedAverage)
      .filter((v): v is number => v != null);
    const overallScore = combinedValues.length
      ? round2(avg(combinedValues))
      : null;

    return {
      lines,
      overallScore,
      ratingBand: this.frameworkRatingBand(overallScore),
    };
  }

  private combine(
    employeeScore: number | null,
    managerScore: number | null,
  ): number | null {
    if (employeeScore == null && managerScore == null) return null;
    if (employeeScore == null) return managerScore;
    if (managerScore == null) return employeeScore;
    return round2((employeeScore + managerScore) / 2);
  }

  private kpiRatingBand(total: number | null): string {
    if (total == null) return '—';
    if (total >= 90) return 'Outstanding';
    if (total >= 80) return 'Exceeds Expectations';
    if (total >= 70) return 'Good';
    if (total >= 60) return 'Satisfactory';
    if (total >= 50) return 'Needs Improvement';
    return 'Unsatisfactory';
  }

  private frameworkRatingBand(avgScore: number | null): string {
    if (avgScore == null) return '—';
    if (avgScore >= 4.0) return 'Strong';
    if (avgScore >= 3.0) return 'Solid';
    if (avgScore >= 2.0) return 'Developing';
    return 'Concern';
  }
}

@Injectable()
export class KpiTemplateService {
  constructor(
    @InjectModel(KpiTemplate.name)
    private readonly templateModel: Model<KpiTemplateDocument>,
  ) {}

  async getAllTemplates(tenantId: string): Promise<KpiTemplateDocument[]> {
    return this.templateModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ jobTitle: 1 })
      .lean() as any;
  }

  async getTemplateForJobTitle(
    tenantId: string,
    jobTitle: string,
  ): Promise<KpiTemplateDocument | null> {
    return this.templateModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      jobTitle: { $regex: `^${escapeRegex(jobTitle)}$`, $options: 'i' },
      isActive: true,
    });
  }

  async upsertTemplate(
    tenantId: string,
    dto: UpsertKpiTemplateDto,
  ): Promise<KpiTemplateDocument> {
    const totalWeight = dto.kpis.reduce((sum, k) => sum + k.weight, 0);
    if (Math.abs(totalWeight - 1) > 0.01) {
      throw new BadRequestException(
        `KPI weights must sum to 100% (currently ${(totalWeight * 100).toFixed(1)}%).`,
      );
    }

    const tId = new Types.ObjectId(tenantId);
    return this.templateModel.findOneAndUpdate(
      { tenantId: tId, jobTitle: dto.jobTitle },
      { tenantId: tId, jobTitle: dto.jobTitle, kpis: dto.kpis, isActive: true },
      { upsert: true, new: true },
    );
  }

  async deleteTemplate(tenantId: string, templateId: string): Promise<void> {
    const deleted = await this.templateModel.findOneAndDelete({
      _id: templateId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('KPI template not found');
  }
}

@Injectable()
export class FrameworkService {
  constructor(
    @InjectModel(CompetencyFramework.name)
    private readonly competencyModel: Model<CompetencyFrameworkDocument>,
    @InjectModel(ValuesFramework.name)
    private readonly valuesModel: Model<ValuesFrameworkDocument>,
  ) {}

  async getOrCreateCompetencies(
    tenantId: string,
  ): Promise<CompetencyFrameworkDocument> {
    const tId = new Types.ObjectId(tenantId);
    const existing = await this.competencyModel.findOne({ tenantId: tId });
    if (existing) return existing;
    return this.competencyModel.create({
      tenantId: tId,
      items: DEFAULT_COMPETENCIES,
    });
  }

  async getOrCreateValues(tenantId: string): Promise<ValuesFrameworkDocument> {
    const tId = new Types.ObjectId(tenantId);
    const existing = await this.valuesModel.findOne({ tenantId: tId });
    if (existing) return existing;
    return this.valuesModel.create({ tenantId: tId, items: DEFAULT_VALUES });
  }

  async updateCompetencies(
    tenantId: string,
    dto: UpdateFrameworkDto,
  ): Promise<CompetencyFrameworkDocument> {
    const tId = new Types.ObjectId(tenantId);
    return this.competencyModel.findOneAndUpdate(
      { tenantId: tId },
      { tenantId: tId, items: dto.items },
      { upsert: true, new: true },
    );
  }

  async updateValues(
    tenantId: string,
    dto: UpdateFrameworkDto,
  ): Promise<ValuesFrameworkDocument> {
    const tId = new Types.ObjectId(tenantId);
    return this.valuesModel.findOneAndUpdate(
      { tenantId: tId },
      { tenantId: tId, items: dto.items },
      { upsert: true, new: true },
    );
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function avg(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
