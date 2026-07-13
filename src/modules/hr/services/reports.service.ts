import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Employee,
  EmployeeDocument,
  EmploymentStatus,
  HrTeam,
  HrTeamDocument,
  PayrollRun,
  PayrollRunDocument,
  Payslip,
  PayslipDocument,
  DisputeCase,
  DisputeCaseDocument,
  EmployeeRecord,
  EmployeeRecordDocument,
  Requisition,
  RequisitionDocument,
  PerformanceReview,
  PerformanceReviewDocument,
  ReviewStatus,
} from '../schemas';
import { PerformanceScoringService } from './performance.service';

const round2 = (n: number) => Math.round(n * 100) / 100;

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Fixed-term',
  intern: 'Internship',
  consultant: 'Consultant',
};

const EDUCATION_LABELS: Record<string, string> = {
  secondary: 'Secondary',
  tvet_diploma: 'TVET / Diploma',
  bachelors: "Bachelor's",
  masters: "Master's",
  phd: 'PhD',
};

const OCCUPATION_LABELS: Record<string, string> = {
  managers: 'Managers',
  professionals: 'Professionals',
  technicians: 'Technicians',
  clerical: 'Clerical',
  service_sales: 'Service / Sales',
  elementary: 'Elementary',
};

// Heuristic, not authoritative — HR can always correct a specific
// employee's nationality classification by editing the raw value.
const EAC_HINTS = [
  'kenya',
  'uganda',
  'tanzania',
  'burundi',
  'south sudan',
  'congo',
  'drc',
  'somalia',
];
const AFRICAN_HINTS = [
  'nigeria',
  'ghana',
  'south africa',
  'ethiopia',
  'egypt',
  'senegal',
  'cameroon',
  'ivor',
  'zambia',
  'zimbabwe',
  'malawi',
  'mozambique',
  'botswana',
  'namibia',
  'morocco',
  'tunisia',
  'algeria',
  'sudan',
  'mali',
  'niger',
  'chad',
  'angola',
  'gabon',
  'benin',
  'togo',
  'sierra leone',
  'liberia',
  'gambia',
  'guinea',
  'lesotho',
  'eswatini',
  'swaziland',
];

function classifyNationality(nationality: string | null): string {
  if (!nationality) return 'Not specified';
  const n = nationality.trim().toLowerCase();
  if (n === 'rwandan' || n === 'rwanda') return 'Rwandan';
  if (EAC_HINTS.some((c) => n.includes(c))) return 'East African Community';
  if (AFRICAN_HINTS.some((c) => n.includes(c))) return 'Other African';
  return 'International';
}

function ageBand(dateOfBirth: Date | null): string {
  if (!dateOfBirth) return 'Not specified';
  const age = Math.floor(
    (Date.now() - new Date(dateOfBirth).getTime()) /
      (365.25 * 24 * 60 * 60 * 1000),
  );
  if (age < 25) return 'Under 25';
  if (age <= 34) return '25 – 34';
  if (age <= 44) return '35 – 44';
  if (age <= 54) return '45 – 54';
  return '55+';
}

function buildDemoRows(
  employees: any[],
  classifier: (e: any) => string,
): {
  category: string;
  male: number;
  female: number;
  total: number;
  share: number;
}[] {
  const map = new Map<
    string,
    { male: number; female: number; other: number }
  >();
  for (const e of employees) {
    const cat = classifier(e);
    if (!map.has(cat)) map.set(cat, { male: 0, female: 0, other: 0 });
    const row = map.get(cat)!;
    if (e.gender === 'male') row.male++;
    else if (e.gender === 'female') row.female++;
    else row.other++;
  }
  const total = employees.length;
  return Array.from(map.entries()).map(
    ([category, { male, female, other }]) => ({
      category,
      male,
      female,
      total: male + female + other,
      share:
        total > 0 ? Math.round(((male + female + other) / total) * 100) : 0,
    }),
  );
}

function countBy<T>(
  items: T[],
  keyFn: (t: T) => string,
): { category: string; count: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item) ?? 'Unspecified';
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

@Injectable()
export class HrReportsService {
  constructor(
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(HrTeam.name)
    private readonly teamModel: Model<HrTeamDocument>,
    @InjectModel(PayrollRun.name)
    private readonly payrollRunModel: Model<PayrollRunDocument>,
    @InjectModel(Payslip.name)
    private readonly payslipModel: Model<PayslipDocument>,
    @InjectModel(DisputeCase.name)
    private readonly disputeCaseModel: Model<DisputeCaseDocument>,
    @InjectModel(EmployeeRecord.name)
    private readonly employeeRecordModel: Model<EmployeeRecordDocument>,
    @InjectModel(Requisition.name)
    private readonly requisitionModel: Model<RequisitionDocument>,
    @InjectModel(PerformanceReview.name)
    private readonly reviewModel: Model<PerformanceReviewDocument>,
    private readonly scoringService: PerformanceScoringService,
  ) {}

  // ── Demographics (MIFOTRA) ───────────────────────────────────
  // Includes suspended employees — still legally employed, unlike
  // payroll/attendance where suspension deliberately excludes them.
  async getDemographicsReport(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const employees = await this.employeeModel
      .find({
        tenantId: tId,
        employmentStatus: {
          $nin: [EmploymentStatus.TERMINATED, EmploymentStatus.RESIGNED],
        },
      })
      .select(
        'gender dateOfBirth nationality employmentType educationLevel occupationalCategory hasDisability',
      )
      .lean();

    const male = employees.filter((e) => e.gender === 'male').length;
    const female = employees.filter((e) => e.gender === 'female').length;
    const withDisability = employees.filter((e) => e.hasDisability).length;

    return {
      totalHeadcount: employees.length,
      totals: { male, female, withDisability },
      age: buildDemoRows(employees, (e) => ageBand(e.dateOfBirth)),
      nationality: buildDemoRows(employees, (e) =>
        classifyNationality(e.nationality),
      ),
      contractType: buildDemoRows(
        employees,
        (e) => CONTRACT_TYPE_LABELS[e.employmentType] ?? 'Other',
      ),
      education: buildDemoRows(employees, (e) =>
        e.educationLevel ? EDUCATION_LABELS[e.educationLevel] : 'Not specified',
      ),
      occupation: buildDemoRows(employees, (e) =>
        e.occupationalCategory
          ? OCCUPATION_LABELS[e.occupationalCategory]
          : 'Not specified',
      ),
      disability: {
        withDisability,
        withoutDisability: employees.length - withDisability,
      },
    };
  }

  // ── Payroll ───────────────────────────────────────────────────
  async getPayrollPeriods(tenantId: string) {
    return this.payrollRunModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .select('periodLabel status periodEnd')
      .sort({ periodEnd: -1 })
      .lean();
  }

  async getPayrollReport(tenantId: string, periodLabel?: string) {
    const tId = new Types.ObjectId(tenantId);
    const query: any = { tenantId: tId };
    if (periodLabel) query.periodLabel = periodLabel;

    const run = await this.payrollRunModel
      .findOne(query)
      .sort({ periodEnd: -1 })
      .lean();

    if (!run) {
      return { period: null, totals: null, byDepartment: [] };
    }

    const payslips = await this.payslipModel
      .find({ payrollRunId: run._id })
      .lean();

    const employeeIds = payslips.map((p) => p.employeeId);
    const employees = await this.employeeModel
      .find({ _id: { $in: employeeIds } })
      .select('teamId')
      .populate('teamId', 'name')
      .lean();
    const teamNameByEmployee = new Map(
      employees.map((e) => [
        (e._id as Types.ObjectId).toString(),
        (e.teamId as any)?.name ?? 'Unassigned',
      ]),
    );

    const byDeptMap = new Map<
      string,
      {
        headcount: number;
        gross: number;
        net: number;
        deductions: number;
        employerContrib: number;
      }
    >();
    let totalGross = 0,
      totalNet = 0,
      totalDeductions = 0,
      totalEmployerContrib = 0;

    for (const p of payslips) {
      totalGross += p.grossSalary;
      totalNet += p.netSalary;
      totalDeductions += p.totalEmployeeDeductions;
      totalEmployerContrib += p.totalEmployerContributions;

      const dept =
        teamNameByEmployee.get(p.employeeId.toString()) ?? 'Unassigned';
      if (!byDeptMap.has(dept))
        byDeptMap.set(dept, {
          headcount: 0,
          gross: 0,
          net: 0,
          deductions: 0,
          employerContrib: 0,
        });
      const row = byDeptMap.get(dept)!;
      row.headcount++;
      row.gross += p.grossSalary;
      row.net += p.netSalary;
      row.deductions += p.totalEmployeeDeductions;
      row.employerContrib += p.totalEmployerContributions;
    }

    return {
      period: run.periodLabel,
      runStatus: run.status,
      currency: run.runCurrency,
      totals: {
        headcount: payslips.length,
        totalGross: round2(totalGross),
        totalNet: round2(totalNet),
        totalDeductions: round2(totalDeductions),
        totalEmployerContributions: round2(totalEmployerContrib),
      },
      byDepartment: Array.from(byDeptMap.entries()).map(([department, r]) => ({
        department,
        headcount: r.headcount,
        gross: round2(r.gross),
        net: round2(r.net),
        deductions: round2(r.deductions),
        employerContrib: round2(r.employerContrib),
      })),
    };
  }

  // ── Disputes ──────────────────────────────────────────────────
  async getDisputesReport(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const cases = await this.disputeCaseModel.find({ tenantId: tId }).lean();

    const resolutionDurations: number[] = [];
    for (const c of cases) {
      if (c.status === 'closed' && (c as any).stageHistory?.length) {
        const last = (c as any).stageHistory[
          (c as any).stageHistory.length - 1
        ];
        const filedAt = new Date(c.filedAt).getTime();
        const closedAt = new Date(last.enteredAt).getTime();
        if (closedAt > filedAt) {
          resolutionDurations.push(
            (closedAt - filedAt) / (1000 * 60 * 60 * 24),
          );
        }
      }
    }

    return {
      total: cases.length,
      byType: countBy(cases, (c) => c.type),
      byStatus: countBy(cases, (c) => c.status),
      byStage: countBy(cases, (c) => c.stage),
      byOutcome: countBy(
        cases.filter((c) => (c as any).outcome),
        (c) => (c as any).outcome.decision,
      ),
      avgResolutionDays:
        resolutionDurations.length > 0
          ? round2(
              resolutionDurations.reduce((s, v) => s + v, 0) /
                resolutionDurations.length,
            )
          : null,
    };
  }

  // ── Employee Records ──────────────────────────────────────────
  async getEmployeeRecordsReport(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const records = await this.employeeRecordModel
      .find({ tenantId: tId })
      .lean();

    const employeeIds = [
      ...new Set(records.map((r) => r.employeeId.toString())),
    ];
    const employees = await this.employeeModel
      .find({ _id: { $in: employeeIds } })
      .select('teamId')
      .populate('teamId', 'name')
      .lean();
    const teamNameByEmployee = new Map(
      employees.map((e) => [
        (e._id as Types.ObjectId).toString(),
        (e.teamId as any)?.name ?? 'Unassigned',
      ]),
    );

    const byDeptMap = new Map<string, Record<string, number>>();
    for (const r of records) {
      const dept =
        teamNameByEmployee.get(r.employeeId.toString()) ?? 'Unassigned';
      if (!byDeptMap.has(dept)) byDeptMap.set(dept, {});
      const bucket = byDeptMap.get(dept)!;
      bucket[r.type] = (bucket[r.type] ?? 0) + 1;
    }

    return {
      total: records.length,
      byType: countBy(records, (r) => r.type),
      byDepartment: Array.from(byDeptMap.entries()).map(
        ([department, counts]) => ({
          department,
          counts,
          total: Object.values(counts).reduce((s, v) => s + v, 0),
        }),
      ),
    };
  }

  // ── Requisitions ──────────────────────────────────────────────
  async getRequisitionsReport(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const reqs = await this.requisitionModel.find({ tenantId: tId }).lean();

    const reviewed = reqs.filter((r) => r.reviewedAt);
    const reviewDurations = reviewed.map(
      (r) =>
        (new Date(r.reviewedAt as Date).getTime() -
          new Date((r as any).createdAt).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    const approvedCount = reqs.filter(
      (r) => r.status === 'approved' || r.status === 'fulfilled',
    ).length;

    return {
      total: reqs.length,
      byStatus: countBy(reqs, (r) => r.status),
      byType: countBy(reqs, (r) => r.typeLabel),
      byPriority: countBy(reqs, (r) => r.priority),
      avgReviewDays:
        reviewDurations.length > 0
          ? round2(
              reviewDurations.reduce((s, v) => s + v, 0) /
                reviewDurations.length,
            )
          : null,
      approvalRate:
        reqs.length > 0 ? round2((approvedCount / reqs.length) * 100) : null,
      totalAmountRequested: round2(
        reqs.reduce((s, r) => s + (r.amount ?? 0), 0),
      ),
    };
  }

  // ── Performance ───────────────────────────────────────────────
  // Same "latest completed review per employee" rule as HR Overview
  // — never re-derive scores outside the canonical scoring service.
  async getPerformanceReport(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);

    const employees = await this.employeeModel
      .find({
        tenantId: tId,
        employmentStatus: {
          $nin: [EmploymentStatus.TERMINATED, EmploymentStatus.RESIGNED],
        },
      })
      .select('_id teamId')
      .populate('teamId', 'name')
      .lean();

    const reviews = await this.reviewModel
      .find({ tenantId: tId, status: ReviewStatus.COMPLETED })
      .select('employeeId kpis managerSignedAt')
      .sort({ managerSignedAt: -1 })
      .lean();

    const latestByEmployee = new Map<string, { score: number; band: string }>();
    for (const r of reviews) {
      const id = r.employeeId.toString();
      if (!latestByEmployee.has(id)) {
        const scored = this.scoringService.scoreKpiSection(r.kpis as any);
        latestByEmployee.set(id, {
          score: scored.totalWeightedScore,
          band: scored.ratingBand,
        });
      }
    }

    const bandCounts = new Map<string, number>();
    for (const v of latestByEmployee.values()) {
      bandCounts.set(v.band, (bandCounts.get(v.band) ?? 0) + 1);
    }

    const byDeptMap = new Map<string, number[]>();
    for (const e of employees) {
      const dept = (e.teamId as any)?.name ?? 'Unassigned';
      if (!byDeptMap.has(dept)) byDeptMap.set(dept, []);
      const entry = latestByEmployee.get((e._id as Types.ObjectId).toString());
      if (entry) byDeptMap.get(dept)!.push(entry.score);
    }

    return {
      totalEmployees: employees.length,
      everReviewed: latestByEmployee.size,
      ratingBandDistribution: Array.from(bandCounts.entries()).map(
        ([band, count]) => ({ band, count }),
      ),
      byDepartment: Array.from(byDeptMap.entries()).map(
        ([department, scores]) => ({
          department,
          reviewed: scores.length,
          avgScore:
            scores.length > 0
              ? round2(scores.reduce((s, v) => s + v, 0) / scores.length)
              : null,
        }),
      ),
    };
  }
}
