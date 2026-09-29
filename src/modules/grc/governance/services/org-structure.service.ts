import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Employee,
  EmployeeDocument,
  EmployeeHierarchyRole,
} from 'src/modules/hr/schemas/employee.schema';
import { HrTeam, HrTeamDocument } from 'src/modules/hr/schemas/hr.schema';

export interface OrgChartNode {
  id: string;
  name: string;
  jobTitle: string;
  hierarchyRole: EmployeeHierarchyRole;
  employeeNumber: string;
  email: string;
  teamId: string | null;
  teamName: string | null;
  reportCount: number;
  children: OrgChartNode[];
}

// Governance → Organisation Structure — derives the real org chart from
// HR's own Employee records (reportsToManagerId/jobTitle/teamId), per the
// PO's explicit choice of HR-derived over a freeform tenant-designed
// structure. Reaches into HR module data via direct Mongoose model
// injection (Employee/HrTeam registered directly in GovernanceModule's
// own MongooseModule.forFeature), the same established convention
// PolicyService/AuditService already use for the identical reason —
// cross-module *service* DI has broken at runtime before in this
// codebase, direct model injection is the working pattern.
//
// No node here is fabricated: a team with no active Head of Department
// simply has no root in the chart (surfaced instead as a real, counted
// "teams without a head" stat) rather than a decorative "Head vacant"
// placeholder card with invented headcount.
@Injectable()
export class OrgStructureService {
  constructor(
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(HrTeam.name)
    private readonly teamModel: Model<HrTeamDocument>,
  ) {}

  async getOrgChart(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);

    const [employees, teams] = await Promise.all([
      this.employeeModel
        .find({
          tenantId: tId,
          employmentStatus: { $nin: ['terminated', 'resigned'] },
        })
        .select(
          'firstName lastName jobTitle hierarchyRole employeeNumber email teamId reportsToManagerId',
        )
        .populate('teamId', 'name')
        .lean(),
      this.teamModel.find({ tenantId: tId }).select('name').lean(),
    ]);

    const idSet = new Set(employees.map((e) => (e._id as any).toString()));

    // childrenMap: reportsToManagerId (as string) -> employees reporting to it
    const childrenMap = new Map<string, typeof employees>();
    for (const emp of employees) {
      const parentId = (emp as any).reportsToManagerId?.toString() ?? null;
      if (!parentId) continue;
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      childrenMap.get(parentId)!.push(emp);
    }

    // Roots: no manager set (the normal Head-of-Department case), or a
    // manager that no longer resolves to an active employee (e.g. the
    // HoD they reported to was since terminated) — surfaced rather than
    // silently dropped from the chart.
    const roots = employees.filter((e) => {
      const parentId = (e as any).reportsToManagerId?.toString() ?? null;
      return !parentId || !idSet.has(parentId);
    });

    const buildNode = (emp: (typeof employees)[number]): OrgChartNode => {
      const id = (emp._id as any).toString();
      const kids = (childrenMap.get(id) ?? [])
        .slice()
        .sort((a, b) => a.firstName.localeCompare(b.firstName))
        .map(buildNode);
      const reportCount = kids.reduce((s, k) => s + 1 + k.reportCount, 0);
      const team = (emp as any).teamId as { _id: any; name: string } | null;
      return {
        id,
        name: `${emp.firstName} ${emp.lastName}`,
        jobTitle: emp.jobTitle,
        hierarchyRole: emp.hierarchyRole,
        employeeNumber: emp.employeeNumber,
        email: emp.email,
        teamId: team ? team._id.toString() : null,
        teamName: team ? team.name : null,
        reportCount,
        children: kids,
      };
    };

    const rootNodes = roots
      .slice()
      .sort((a, b) => a.firstName.localeCompare(b.firstName))
      .map(buildNode);

    // Real "head vacancy" stat: a team with at least one active employee
    // but no active Head of Department among them.
    const teamsWithHead = new Set(
      employees
        .filter(
          (e) => e.hierarchyRole === EmployeeHierarchyRole.HEAD_OF_DEPARTMENT,
        )
        .map((e) => (e as any).teamId?._id?.toString())
        .filter(Boolean),
    );
    const teamIdsWithEmployees = new Set(
      employees.map((e) => (e as any).teamId?._id?.toString()).filter(Boolean),
    );
    const teamsWithoutHead = teams.filter(
      (t) =>
        teamIdsWithEmployees.has((t._id as any).toString()) &&
        !teamsWithHead.has((t._id as any).toString()),
    ).length;

    return {
      stats: {
        totalEmployees: employees.length,
        teams: teamIdsWithEmployees.size,
        headsOfDepartment: employees.filter(
          (e) => e.hierarchyRole === EmployeeHierarchyRole.HEAD_OF_DEPARTMENT,
        ).length,
        managers: employees.filter(
          (e) => e.hierarchyRole === EmployeeHierarchyRole.MANAGER,
        ).length,
        teamsWithoutHead,
      },
      roots: rootNodes,
    };
  }
}
