import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { UpdateTenantProfileDto } from '../dto/tenant.dto';
import {
  UserType,
  AccountStatus,
} from '../../../common/interfaces/user-role.enum';
import { EmailService } from '../../../common/utils/mailing/email.service';
import {
  SubscriptionPlanConfig,
  SubscriptionPlanDocument,
  PlatformModule,
  PlatformModuleDocument,
} from 'src/modules/super_admin/schemas';
import { Employee, EmployeeDocument } from 'src/modules/hr/schemas';
import {
  ClientProfileRecord,
  ClientProfileDocument,
} from '../schemas/client-profile.schema';
import { Risk, RiskDocument } from '../../grc/risk/schemas/risk.schema';
import {
  Incident,
  IncidentDocument,
} from '../../grc/risk/schemas/incident.schema';
import {
  ComplianceObligation,
  ComplianceObligationDocument,
  ObligationStatus,
} from '../../grc/compliance/schemas/obligation.schema';
import {
  Deal,
  DealDocument,
  DealStatus,
} from '../../grc/deals/schemas/deal.schema';
import {
  Mandate,
  MandateDocument_,
  MandateStage,
} from '../../crm/projects/schemas/mandate.schema';
import {
  Task,
  TaskDocument_,
  TaskStatus,
} from '../../crm/projects/schemas/task.schema';
import {
  Ticket,
  TicketDocument,
  TicketStatus,
} from '../../crm/projects/schemas/ticket.schema';
import {
  Invoice,
  InvoiceDocument,
  InvoiceStage,
} from '../../crm/finance/schemas/invoice.schema';
import {
  LeaveRequest,
  LeaveRequestDocument,
  LeaveStatus,
} from '../../hr/schemas/leave-request.schema';
import {
  TimeEntry,
  TimeEntryDocument,
  TimesheetStatus,
} from '../../crm/projects/schemas/time-entry.schema';
import {
  RiskStatus,
  ControlEffectiveness,
} from '../../grc/risk/schemas/risk.schema';
import { IncidentStatus } from '../../grc/risk/schemas/incident.schema';

// Role hierarchy — members can only assign roles below their own level
const ROLE_HIERARCHY: Record<string, number> = {
  tenant_owner: 5,
  tenant_admin: 4,
  tenant_manager: 3,
  tenant_compliance: 2,
  tenant_finance: 2,
  tenant_support: 1,
};

@Injectable()
export class TenantService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(SubscriptionPlanConfig.name)
    private readonly planModel: Model<SubscriptionPlanDocument>,
    @InjectModel('TenantSubscription')
    private readonly subscriptionModel: Model<any>,
    @InjectModel(PlatformModule.name)
    private readonly moduleModel: Model<PlatformModuleDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(ClientProfileRecord.name)
    private readonly clientProfileModel: Model<ClientProfileDocument>,
    @InjectModel(Risk.name)
    private readonly riskModel: Model<RiskDocument>,
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
    @InjectModel(ComplianceObligation.name)
    private readonly obligationModel: Model<ComplianceObligationDocument>,
    @InjectModel(Deal.name)
    private readonly dealModel: Model<DealDocument>,
    @InjectModel(Mandate.name)
    private readonly mandateModel: Model<MandateDocument_>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument_>,
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
    @InjectModel(Invoice.name)
    private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(LeaveRequest.name)
    private readonly leaveModel: Model<LeaveRequestDocument>,
    @InjectModel(TimeEntry.name)
    private readonly timeEntryModel: Model<TimeEntryDocument>,
    private readonly mailService: EmailService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════

  async getDashboard(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const [
      teamByRole,
      subscription,
      recentMembers,
      totalTeam,
      activeTeam,
      // ── HR stats ──────────────────────────────────────────
      totalEmployees,
      activeEmployees,
      employeesByClient,
      hrRecentJoins,
      // ── KYC / AML ───────────────────────────────────────────
      kycTotal,
      kycApproved,
      kycHighRisk,
      pendingKyc,
      // ── GRC ───────────────────────────────────────────────
      openRisks,
      openIncidents,
      overdueObligations,
      liveDeals,
      dealsWon,
      // ── CRM ───────────────────────────────────────────────
      activeMandates,
      openTasks,
      tasksDone,
      tasksTotal,
      overdueInvoices,
      openInvoices,
      paidInvoices,
      openTickets,
      // ── HR: leave ─────────────────────────────────────────
      pendingLeave,
      // ── Delivery pulse ──────────────────────────────────────
      weeklyTimeEntries,
      recentTimeEntries,
    ] = await Promise.all([
      // Existing team queries
      this.userModel.aggregate([
        { $match: { userType: UserType.TENANT, tenantId: tId } },
        { $unwind: '$roles' },
        { $group: { _id: '$roles', count: { $sum: 1 } } },
      ]),
      this.subscriptionModel
        .findOne({ tenantId: tId })
        .select('plan status activeModules trialEndsAt currentPeriodEnd')
        .lean(),
      this.userModel
        .find({ userType: UserType.TENANT, tenantId: tId })
        .select('firstName lastName email roles status createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      this.userModel.countDocuments({
        userType: UserType.TENANT,
        tenantId: tId,
      }),
      this.userModel.countDocuments({
        userType: UserType.TENANT,
        tenantId: tId,
        status: AccountStatus.ACTIVE,
      }),

      // HR queries
      this.employeeModel.countDocuments({ tenantId: tId }),
      this.employeeModel.countDocuments({
        tenantId: tId,
        employmentStatus: 'active',
      }),
      this.employeeModel.aggregate([
        { $match: { tenantId: tId, employmentStatus: 'active' } },
        { $group: { _id: '$clientId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      this.employeeModel
        .find({ tenantId: tId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('firstName lastName jobTitle department clientId startDate')
        .lean(),

      // ── KYC / AML ──────────────────────────────────────────
      this.clientProfileModel.countDocuments({ tenantId: tId }),
      this.clientProfileModel.countDocuments({
        tenantId: tId,
        kycStatus: 'approved',
      }),
      this.clientProfileModel.countDocuments({
        tenantId: tId,
        riskLevel: 'high',
      }),
      this.clientProfileModel
        .find({ tenantId: tId, kycStatus: { $ne: 'approved' } })
        .populate('userId', 'firstName lastName businessName')
        .populate('assignedTo', 'firstName lastName')
        .sort({ updatedAt: -1 })
        .limit(5)
        .select('userId kycStatus riskLevel assignedTo updatedAt')
        .lean(),

      // ── GRC: risk register ────────────────────────────────
      this.riskModel
        .find({ tenantId: tId, status: { $ne: RiskStatus.CLOSED } })
        .select('title likelihood impact controls owner status')
        .lean(),
      // ── GRC: incidents ─────────────────────────────────────
      this.incidentModel
        .find({ tenantId: tId, status: { $ne: IncidentStatus.CLOSED } })
        .select('title severity status')
        .lean(),
      // ── GRC: compliance obligations ────────────────────────
      this.obligationModel
        .find({
          tenantId: tId,
          status: { $in: [ObligationStatus.DUE, ObligationStatus.OVERDUE] },
        })
        .select('title regulator status nextDueDate')
        .lean(),
      // ── GRC: deals ──────────────────────────────────────────
      this.dealModel
        .find({ tenantId: tId, status: DealStatus.ACTIVE })
        .select('value status')
        .lean(),
      this.dealModel.countDocuments({
        tenantId: tId,
        status: DealStatus.COMPLETED,
      }),

      // ── CRM: mandates ───────────────────────────────────────
      this.mandateModel
        .find({ tenantId: tId, stage: { $ne: MandateStage.CLOSE } })
        .select('name clientName rag progress targetDate')
        .lean(),
      // ── CRM: tasks ───────────────────────────────────────────
      this.taskModel.countDocuments({
        tenantId: tId,
        status: { $ne: TaskStatus.DONE },
      }),
      this.taskModel.countDocuments({ tenantId: tId, status: TaskStatus.DONE }),
      this.taskModel.countDocuments({ tenantId: tId }),
      // ── CRM: invoices ────────────────────────────────────────
      this.invoiceModel
        .find({ tenantId: tId, stage: InvoiceStage.OVERDUE })
        .select(
          'ref clientName dueOn currency lines discount vatRate whtRate paidAmount',
        )
        .lean(),
      this.invoiceModel
        .find({
          tenantId: tId,
          stage: { $nin: [InvoiceStage.PAID, InvoiceStage.DRAFT] },
        })
        .select('lines discount vatRate whtRate paidAmount')
        .lean(),
      this.invoiceModel
        .find({ tenantId: tId, stage: InvoiceStage.PAID })
        .select('paidAmount')
        .lean(),
      // ── CRM: tickets ─────────────────────────────────────────
      this.ticketModel.countDocuments({
        tenantId: tId,
        status: { $nin: [TicketStatus.RESOLVED, TicketStatus.CLOSED] },
      }),

      // ── HR: leave ────────────────────────────────────────────
      this.leaveModel
        .find({ tenantId: tId, status: LeaveStatus.PENDING })
        .populate('employeeId', 'firstName lastName')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      // ── Delivery pulse: this week's approved time entries ────
      this.timeEntryModel
        .find({
          tenantId: tId,
          status: TimesheetStatus.APPROVED,
          date: { $gte: startOfWeek },
        })
        .select('hours billable rate')
        .lean(),
      // ── Recent activity: most recently logged entries ────────
      this.timeEntryModel
        .find({ tenantId: tId })
        .sort({ createdAt: -1 })
        .limit(6)
        .select('member mandateName taskTitle hours date narrative')
        .lean(),
    ]);

    // ── Real risk scoring — same formula RiskService itself uses,
    // so "critical" here means the same thing it means on the real
    // risk register, not a different, looser dashboard-only bar.
    const residualScore = (r: {
      likelihood: number;
      impact: number;
      controls: { effectiveness: ControlEffectiveness }[];
    }) => {
      const best = r.controls.reduce<ControlEffectiveness | null>((acc, c) => {
        if (c.effectiveness === ControlEffectiveness.EFFECTIVE)
          return ControlEffectiveness.EFFECTIVE;
        if (
          c.effectiveness === ControlEffectiveness.PARTIALLY_EFFECTIVE &&
          acc !== ControlEffectiveness.EFFECTIVE
        )
          return ControlEffectiveness.PARTIALLY_EFFECTIVE;
        return acc;
      }, null);
      let likelihood = r.likelihood;
      if (best === ControlEffectiveness.EFFECTIVE)
        likelihood = Math.max(1, likelihood - 2);
      else if (best === ControlEffectiveness.PARTIALLY_EFFECTIVE)
        likelihood = Math.max(1, likelihood - 1);
      return likelihood * r.impact;
    };
    const invoicePayable = (inv: any) => {
      const subtotal = (inv.lines ?? []).reduce(
        (s: number, l: any) => s + l.qty * l.unit,
        0,
      );
      const net = subtotal - (inv.discount ?? 0);
      const vat = (net * (inv.vatRate ?? 0)) / 100;
      const wht = (net * (inv.whtRate ?? 0)) / 100;
      return net + vat - wht;
    };

    const criticalRisks = openRisks.filter((r) => residualScore(r) >= 17);
    const kycScore = kycTotal ? Math.round((kycApproved / kycTotal) * 100) : 0;
    const hrScore = totalEmployees
      ? Math.round((activeEmployees / totalEmployees) * 100)
      : 0;
    const crmScore = activeMandates.length
      ? Math.round(
          (activeMandates.filter((m) => m.rag === 'Green').length /
            activeMandates.length) *
            100,
        )
      : 0;
    const grcScore = Math.max(
      0,
      100 -
        criticalRisks.length * 8 -
        overdueObligations.length * 6 -
        openIncidents.length * 4,
    );
    const overallScore = Math.round(
      (kycScore + grcScore + crmScore + hrScore) / 4,
    );
    const dueObligations = overdueObligations.filter(
      (o) => o.status === ObligationStatus.DUE,
    );
    const trueOverdueObligations = overdueObligations.filter(
      (o) => o.status === ObligationStatus.OVERDUE,
    );
    const atRiskMandates = activeMandates.filter((m) => m.rag !== 'Green');
    const receivables = openInvoices.reduce(
      (s, i) => s + (invoicePayable(i) - (i.paidAmount ?? 0)),
      0,
    );
    const collected = paidInvoices.reduce((s, i) => s + (i.paidAmount ?? 0), 0);
    const dealValue = liveDeals.reduce((s, d) => s + (d.value ?? 0), 0);

    // ── Delivery pulse — real, from this week's approved entries
    // only, same rule the finance module itself uses: unapproved
    // hours aren't real revenue yet.
    const totalHours = weeklyTimeEntries.reduce((s, e: any) => s + e.hours, 0);
    const billableHours = weeklyTimeEntries
      .filter((e: any) => e.billable)
      .reduce((s, e: any) => s + e.hours, 0);
    const weeklyRevenue = weeklyTimeEntries
      .filter((e: any) => e.billable)
      .reduce((s, e: any) => s + e.hours * (e.rate ?? 0), 0);
    const utilisation = totalHours
      ? Math.round((billableHours / totalHours) * 100)
      : 0;

    // ── Real attention feed — same records the module pages
    // themselves would flag, not a fabricated summary. ─────────
    const attention: any[] = [];
    criticalRisks.slice(0, 2).forEach((r: any) =>
      attention.push({
        id: `risk-${r._id}`,
        module: 'GRC',
        title: r.title,
        detail: `Residual score ${residualScore(r)} · owner ${r.owner}`,
        severity: 'critical',
        to: '/grc/risk/register',
      }),
    );
    trueOverdueObligations.slice(0, 2).forEach((o: any) =>
      attention.push({
        id: `obl-${o._id}`,
        module: 'GRC',
        title: o.title,
        detail: `${o.regulator} · due ${new Date(o.nextDueDate).toLocaleDateString()}`,
        severity: 'critical',
        to: '/grc/compliance/obligations',
      }),
    );
    overdueInvoices.slice(0, 2).forEach((i: any) =>
      attention.push({
        id: `inv-${i._id}`,
        module: 'CRM',
        title: `${i.ref} — ${i.clientName}`,
        detail: `Overdue since ${new Date(i.dueOn).toLocaleDateString()} · ${i.currency} ${Math.round(invoicePayable(i) - (i.paidAmount ?? 0)).toLocaleString()}`,
        severity: 'critical',
        to: '/crm/finance/invoicing',
      }),
    );
    atRiskMandates.slice(0, 2).forEach((m: any) =>
      attention.push({
        id: `mnd-${m._id}`,
        module: 'CRM',
        title: m.name,
        detail: `${m.clientName} · ${m.progress}% complete · target ${new Date(m.targetDate).toLocaleDateString()}`,
        severity: m.rag === 'Red' ? 'critical' : 'warning',
        to: '/crm/mandates',
      }),
    );
    pendingKyc.slice(0, 2).forEach((c: any) =>
      attention.push({
        id: `kyc-${c._id}`,
        module: 'AML/KYC',
        title:
          c.userId?.businessName ||
          `${c.userId?.firstName ?? ''} ${c.userId?.lastName ?? ''}`.trim(),
        detail: `KYC ${c.kycStatus} · ${c.riskLevel} risk${c.assignedTo ? ` · officer ${c.assignedTo.firstName} ${c.assignedTo.lastName}` : ''}`,
        severity: c.riskLevel === 'high' ? 'critical' : 'warning',
        to: '/clients',
      }),
    );
    pendingLeave.slice(0, 2).forEach((l: any) =>
      attention.push({
        id: `leave-${l._id}`,
        module: 'HR',
        title: `${l.employeeId?.firstName ?? ''} ${l.employeeId?.lastName ?? ''} — ${l.type} leave`,
        detail: `${new Date(l.startDate).toLocaleDateString()} → ${new Date(l.endDate).toLocaleDateString()} · awaiting approval`,
        severity: 'info',
        to: '/my/leave',
      }),
    );
    openIncidents.slice(0, 2).forEach((i: any) =>
      attention.push({
        id: `inc-${i._id}`,
        module: 'GRC',
        title: i.title,
        detail: `${i.severity} severity · ${i.status}`,
        severity: i.severity === 'Critical' ? 'critical' : 'warning',
        to: '/grc/risk/incidents',
      }),
    );
    const rank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    attention.sort((a, b) => rank[a.severity] - rank[b.severity]);

    return {
      team: {
        total: totalTeam,
        active: activeTeam,
        byRole: teamByRole,
        recentMembers,
      },
      subscription: {
        plan: subscription?.plan || null,
        status: subscription?.status || null,
        activeModules: subscription?.activeModules || [],
        trialEndsAt: subscription?.trialEndsAt || null,
        currentPeriodEnd: subscription?.currentPeriodEnd || null,
      },
      hr: {
        totalEmployees,
        activeEmployees,
        employeesByClient,
        recentJoins: hrRecentJoins,
        pendingLeave: pendingLeave.length,
        score: hrScore,
      },
      kyc: {
        total: kycTotal,
        approved: kycApproved,
        pending: kycTotal - kycApproved,
        highRisk: kycHighRisk,
        score: kycScore,
      },
      grc: {
        openRisks: openRisks.length,
        criticalRisks: criticalRisks.length,
        openIncidents: openIncidents.length,
        dueObligations: dueObligations.length,
        overdueObligations: trueOverdueObligations.length,
        liveDeals: liveDeals.length,
        dealsWon,
        dealValue,
        score: grcScore,
      },
      crm: {
        activeMandates: activeMandates.length,
        atRiskMandates: atRiskMandates.length,
        openTasks,
        tasksDone,
        tasksTotal,
        openTickets,
        overdueInvoices: overdueInvoices.length,
        receivables,
        score: crmScore,
      },
      attention: attention.slice(0, 10),
      wins: [
        {
          label: 'Collected',
          value: `$${Math.round(collected).toLocaleString()}`,
          hint: 'Cash received on settled invoices',
        },
        {
          label: 'Tasks delivered',
          value: `${tasksDone}/${tasksTotal}`,
          hint: 'Delivery items closed out',
        },
        {
          label: 'Deals closed',
          value: dealsWon,
          hint: 'Transactions completed',
        },
        {
          label: 'Pipeline value',
          value: `$${Math.round(dealValue / 1000)}k`,
          hint: 'Value of live deals in flight',
        },
      ],
      overallScore,
      deliveryPulse: {
        totalHours,
        billableHours,
        revenue: weeklyRevenue,
        utilisation,
      },
      recentActivity: recentTimeEntries.map((e: any) => ({
        id: e._id,
        projectName: e.mandateName,
        description: e.taskTitle || e.narrative || 'Time logged',
        teamMemberName: e.member,
        hours: e.hours,
        date: e.date,
      })),
      generatedAt: new Date(),
    };
  }
  // ═══════════════════════════════════════════════════════════
  // PROFILE
  // ═══════════════════════════════════════════════════════════

  async getMyProfile(tenantId: string): Promise<UserDocument> {
    const tenant = await this.userModel
      .findById(tenantId)
      .select('-password -passwordResetToken')
      .lean();
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant as UserDocument;
  }

  async updateMyProfile(
    tenantId: string,
    dto: UpdateTenantProfileDto,
  ): Promise<UserDocument> {
    const update: any = {};
    if (dto.phone) update.phone = dto.phone;

    const profileFields = [
      'businessName',
      'industry',
      'website',
      'registrationNumber',
      'taxId',
      'address',
      'contactPerson',
    ];
    for (const field of profileFields) {
      if (dto[field] !== undefined) {
        update[`tenantProfile.${field}`] = dto[field];
      }
    }

    const tenant = await this.userModel
      .findByIdAndUpdate(tenantId, { $set: update }, { new: true })
      .select('-password -passwordResetToken');

    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  // ═══════════════════════════════════════════════════════════
  // MODULES (view-only for tenant)
  // ═══════════════════════════════════════════════════════════

  async getMyModules(tenantId: string) {
    const subscription = await this.subscriptionModel
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .select(
        'plan status activeModules baseModules addonModules trialEndsAt currentPeriodEnd',
      )
      .lean();

    if (!subscription) {
      return {
        plan: null,
        status: null,
        activeModules: [],
        baseModules: [],
        addonModules: [],
        message: 'No subscription found. Contact your administrator.',
      };
    }

    return {
      plan: subscription.plan,
      status: subscription.status,
      activeModules: subscription.activeModules || [],
      baseModules: subscription.baseModules || [],
      addonModules: subscription.addonModules || [],
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
    };
  }

  // ── Get available plans (for tenant to browse before upgrading) ──
  async getAvailablePlans() {
    return this.planModel
      .find({ isActive: true })
      .select(
        'plan displayName description priceMonthly priceAnnual features maxClients maxUsers includedModules',
      )
      .sort({ priceMonthly: 1 })
      .lean();
  }

  // ── Self-upgrade plan ─────────────────────────────────────────
  async upgradePlan(tenantId: string, newPlan: string) {
    const plan = await this.planModel
      .findOne({ plan: newPlan, isActive: true })
      .lean();
    if (!plan)
      throw new NotFoundException(`Plan "${newPlan}" not found or inactive`);

    const current = await this.subscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!current) throw new NotFoundException('No subscription found');

    if (current.plan === newPlan) {
      throw new BadRequestException('You are already on this plan');
    }

    // Update subscription with new plan's modules
    let baseModules: string[] = [];

    if (newPlan === 'free') {
      // FREE plan gets all active modules
      const allModules = await this.moduleModel
        .find({ isActive: true })
        .select('key')
        .lean();
      baseModules = allModules.map((m) => m.key);
    } else {
      // Paid plan: find all active modules that include this plan
      const planModules = await this.moduleModel
        .find({ isActive: true, includedInPlans: newPlan })
        .select('key')
        .lean();
      baseModules = planModules.map((m) => m.key);

      // Fallback: if no modules found via includedInPlans, try planConfig
      // (handles edge case where modules haven't been linked yet)
      if (baseModules.length === 0 && plan.includedModules?.length > 0) {
        baseModules = plan.includedModules;
      }
    }

    const addonModules = current.addonModules || [];
    const activeModules = [...new Set([...baseModules, ...addonModules])];
    const periodEnd = new Date(new Date().setMonth(new Date().getMonth() + 1));

    await this.subscriptionModel.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId) },
      {
        plan: newPlan,
        status: 'active',
        baseModules,
        activeModules,
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
        cancelledAt: null,
      },
    );

    return {
      success: true,
      message: `Successfully upgraded to the ${plan.plan || newPlan} plan.`,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  private enforceRoleHierarchy(inviterRoles: string[], targetRole: string) {
    const inviterMaxLevel = Math.max(
      ...inviterRoles.map((r) => ROLE_HIERARCHY[r] ?? 0),
    );
    const targetLevel = ROLE_HIERARCHY[targetRole] ?? 0;

    if (targetLevel >= inviterMaxLevel) {
      throw new ForbiddenException(
        `You cannot assign the "${targetRole}" role. ` +
          `You can only assign roles below your own access level.`,
      );
    }
  }

  private leaveTypeLabel(type: string): string {
    const map: Record<string, string> = {
      annual: 'Annual Leave',
      sick: 'Sick Leave',
      maternity: 'Maternity Leave',
      paternity: 'Paternity Leave',
      compassionate: 'Compassionate Leave',
      study: 'Study Leave',
      unpaid: 'Unpaid Leave',
    };
    return map[type] ?? type;
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const special = '@#$!';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    pass += special.charAt(Math.floor(Math.random() * special.length));
    pass += Math.floor(Math.random() * 9);
    return pass;
  }
}
