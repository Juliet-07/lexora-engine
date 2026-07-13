import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Employee,
  EmployeeDocument,
  EmployeeHierarchyRole,
  EmploymentStatus,
  HrTeam,
  HrTeamDocument,
  PerformanceReview,
  PerformanceReviewDocument,
  ReviewStatus,
  JobOpening,
  JobOpeningDocument,
  JobOpeningStatus,
} from '../schemas';
import { AttendanceService } from './attendance.service';
import { PerformanceScoringService } from './performance.service';

export interface DepartmentOverviewRow {
  teamId: string;
  name: string;
  head: string | null;
  headcount: number;
  managers: number;
  openRoles: number;
  avgPerformance: number | null; // 0–100 scale, null if nobody's been reviewed yet
  reviewsCompleted: number;
  reviewsTotal: number;
  attendanceRate: number | null; // 0–100, today's snapshot
}

export interface HrOverviewResponse {
  departments: DepartmentOverviewRow[];
  totals: {
    headcount: number;
    departmentCount: number;
    openRoles: number;
    avgPerformance: number | null;
    reviewsCompleted: number;
    reviewsTotal: number;
    avgAttendance: number | null;
  };
  topPerformingDepartment: { name: string; avgPerformance: number } | null;
}

@Injectable()
export class HrOverviewService {
  constructor(
    @InjectModel(HrTeam.name)
    private readonly teamModel: Model<HrTeamDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(PerformanceReview.name)
    private readonly reviewModel: Model<PerformanceReviewDocument>,
    @InjectModel(JobOpening.name)
    private readonly jobOpeningModel: Model<JobOpeningDocument>,
    private readonly attendanceService: AttendanceService,
    private readonly scoringService: PerformanceScoringService,
  ) {}

  async getOverview(tenantId: string): Promise<HrOverviewResponse> {
    const tId = new Types.ObjectId(tenantId);

    const [teams, employees, openJobs, completedReviews] = await Promise.all([
      this.teamModel.find({ tenantId: tId, isActive: true }).lean(),
      this.employeeModel
        .find({
          tenantId: tId,
          employmentStatus: {
            $nin: [
              EmploymentStatus.TERMINATED,
              EmploymentStatus.RESIGNED,
              EmploymentStatus.SUSPENDED,
            ],
          },
        })
        .select('_id teamId firstName lastName hierarchyRole')
        .lean(),
      this.jobOpeningModel
        .find({ tenantId: tId, status: { $ne: JobOpeningStatus.FILLED } })
        .select('teamId')
        .lean(),
      // All-time, per your call — an employee counts as "reviewed"
      // if they have ever had one completed review, regardless of cycle.
      this.reviewModel
        .find({ tenantId: tId, status: ReviewStatus.COMPLETED })
        .select('employeeId kpis managerSignedAt')
        .sort({ managerSignedAt: -1 }) // newest first, so the first hit per employee below is their latest
        .lean(),
    ]);

    // Most recent completed score per employee — scored ONLY via the
    // canonical scoring service, never re-derived independently.
    const latestScoreByEmployee = new Map<string, number>();
    const everReviewedIds = new Set<string>();
    for (const review of completedReviews) {
      const empId = review.employeeId.toString();
      everReviewedIds.add(empId);
      if (!latestScoreByEmployee.has(empId)) {
        const scored = this.scoringService.scoreKpiSection(review.kpis as any);
        latestScoreByEmployee.set(empId, scored.totalWeightedScore);
      }
    }

    const openRolesByTeam = new Map<string, number>();
    for (const job of openJobs) {
      const key = job.teamId?.toString() ?? 'none';
      openRolesByTeam.set(key, (openRolesByTeam.get(key) ?? 0) + 1);
    }

    const employeesByTeam = new Map<string, typeof employees>();
    for (const e of employees) {
      const key = e.teamId?.toString() ?? 'none';
      if (!employeesByTeam.has(key)) employeesByTeam.set(key, []);
      employeesByTeam.get(key)!.push(e);
    }

    const departments: DepartmentOverviewRow[] = await Promise.all(
      teams.map(async (team) => {
        const teamIdStr = (team._id as Types.ObjectId).toString();
        const teamEmployees = employeesByTeam.get(teamIdStr) ?? [];
        const headcount = teamEmployees.length;
        const managers = teamEmployees.filter(
          (e) => e.hierarchyRole === EmployeeHierarchyRole.MANAGER,
        ).length;
        const hod = teamEmployees.find(
          (e) => e.hierarchyRole === EmployeeHierarchyRole.HEAD_OF_DEPARTMENT,
        );

        const reviewedEmployees = teamEmployees.filter((e) =>
          everReviewedIds.has((e._id as Types.ObjectId).toString()),
        );
        const scores = reviewedEmployees
          .map((e) =>
            latestScoreByEmployee.get((e._id as Types.ObjectId).toString()),
          )
          .filter((s): s is number => s != null);
        const avgPerformance =
          scores.length > 0
            ? Math.round(
                (scores.reduce((s, v) => s + v, 0) / scores.length) * 10,
              ) / 10
            : null;

        const { stats } = await this.attendanceService.getTodayAttendance(
          tenantId,
          teamIdStr,
        );
        const clockedIn = stats.present + stats.late + stats.remote;
        const attendanceRate =
          stats.total > 0
            ? Math.round((clockedIn / stats.total) * 1000) / 10
            : null;

        return {
          teamId: teamIdStr,
          name: team.name,
          head: hod ? `${hod.firstName} ${hod.lastName}` : null,
          headcount,
          managers,
          openRoles: openRolesByTeam.get(teamIdStr) ?? 0,
          avgPerformance,
          reviewsCompleted: reviewedEmployees.length,
          reviewsTotal: headcount,
          attendanceRate,
        };
      }),
    );

    // Org-wide totals computed directly from the full employee list —
    // not derived from the per-team rows — so nobody is missed just
    // because they have no teamId set.
    const totalHeadcount = employees.length;
    const reviewedEmployeesOrgWide = employees.filter((e) =>
      everReviewedIds.has((e._id as Types.ObjectId).toString()),
    );
    const orgScores = reviewedEmployeesOrgWide
      .map((e) =>
        latestScoreByEmployee.get((e._id as Types.ObjectId).toString()),
      )
      .filter((s): s is number => s != null);
    const avgPerformance =
      orgScores.length > 0
        ? Math.round(
            (orgScores.reduce((s, v) => s + v, 0) / orgScores.length) * 10,
          ) / 10
        : null;

    const { stats: orgAttStats } =
      await this.attendanceService.getTodayAttendance(tenantId);
    const orgClockedIn =
      orgAttStats.present + orgAttStats.late + orgAttStats.remote;
    const avgAttendance =
      orgAttStats.total > 0
        ? Math.round((orgClockedIn / orgAttStats.total) * 1000) / 10
        : null;

    const deptsWithPerf = departments.filter((d) => d.avgPerformance != null);
    const topPerformingDepartment =
      deptsWithPerf.length > 0
        ? deptsWithPerf.reduce((best, d) =>
            d.avgPerformance! > best.avgPerformance! ? d : best,
          )
        : null;

    return {
      departments,
      totals: {
        headcount: totalHeadcount,
        departmentCount: teams.length,
        openRoles: openJobs.length,
        avgPerformance,
        reviewsCompleted: reviewedEmployeesOrgWide.length,
        reviewsTotal: totalHeadcount,
        avgAttendance,
      },
      topPerformingDepartment: topPerformingDepartment
        ? {
            name: topPerformingDepartment.name,
            avgPerformance: topPerformingDepartment.avgPerformance!,
          }
        : null,
    };
  }
}
