import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { ReportPackService } from 'src/modules/crm/finance/services/report-pack.service';
import { ReportPeriodType } from 'src/modules/crm/finance/schemas/management-report.schema';
import type { HsMeasured } from './health-score.model';

// ═══════════════════════════════════════════════════════════════
// Measures every Health Score indicator from the tenant's own
// records. One small function per indicator; each returns null when
// there is nothing to measure it from (the score then leaves it out
// rather than guess), and one failing never stops the others.
//
// Records are read straight from their collections so the Health
// Score does not need to import every module in the system. The
// rule for each indicator is spelled out next to it and in plain
// language in health-score.model.ts (what the Algorithm tab shows).
// ═══════════════════════════════════════════════════════════════

const DAY = 86_400_000;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** "7 of 9" style share → a measured percentage, or null with no population. */
function share(good: number, total: number, what: string): HsMeasured | null {
  if (total <= 0) return null;
  return {
    value: r1((good / total) * 100),
    basis: `${good} of ${total} ${what}`,
    sample: total,
  };
}

@Injectable()
export class HealthScoreCollector {
  private readonly log = new Logger(HealthScoreCollector.name);

  constructor(
    @InjectConnection() private readonly conn: Connection,
    private readonly reportPack: ReportPackService,
  ) {}

  private async rows(
    collection: string,
    tenantId: Types.ObjectId,
    filter: Record<string, any> = {},
  ): Promise<any[]> {
    return this.conn
      .collection(collection)
      .find({ tenantId, ...filter })
      .toArray();
  }

  /** Runs one indicator; a failure is logged and counts as "not measured". */
  private async safe(
    name: string,
    fn: () => Promise<HsMeasured | null> | HsMeasured | null,
  ): Promise<HsMeasured | null> {
    try {
      return await fn();
    } catch (e) {
      this.log.warn(
        `Health score: ${name} could not be measured — ${(e as Error).message}`,
      );
      return null;
    }
  }

  async collect(tenantId: string): Promise<Record<string, HsMeasured | null>> {
    const tid = new Types.ObjectId(tenantId);
    const now = new Date();
    const yearAgo = new Date(now.getTime() - 365 * DAY);

    // The finance report pack is built once and shared by the finance
    // and CRM indicators that come from it.
    const quarter = `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
    const packP = this.reportPack
      .buildPack(tenantId, ReportPeriodType.QUARTER, quarter)
      .catch((e) => {
        this.log.warn(
          `Health score: finance report pack unavailable — ${e.message}`,
        );
        return null;
      });
    const pack = await packP;

    const out: Record<string, HsMeasured | null> = {};
    const tasks: Promise<void>[] = [];
    const add = (
      key: string,
      fn: () => Promise<HsMeasured | null> | HsMeasured | null,
    ) => {
      tasks.push(
        this.safe(key, fn).then((m) => {
          out[key] = m;
        }),
      );
    };
    const ctx = { tid, now, yearAgo, pack };

    this.grc(add, ctx);
    this.finance(add, ctx);
    this.hr(add, ctx);
    this.crm(add, ctx);
    this.aml(add, ctx);

    await Promise.all(tasks);
    return out;
  }

  // ── GRC ────────────────────────────────────────────────────────
  private grc(add: Add, c: Ctx) {
    const { tid, now, yearAgo } = c;

    add('grc.board_meeting_compliance', async () => {
      const ms = await this.rows('grc_governance_meetings', tid, {
        type: { $in: ['Board', 'Committee'] },
        date: { $gte: yearAgo, $lt: now },
        status: { $in: ['Sent', 'Held', 'Postponed'] },
      });
      const ok = ms.filter((m) => {
        if (m.status !== 'Held') return false;
        if ((m.postponementHistory ?? []).length > 0) return false;
        const entries: any[] = m.attendanceEntries ?? [];
        if (entries.length) {
          const here = entries.filter((e) =>
            ['Present', 'Proxy'].includes(e.status),
          ).length;
          return here * 2 >= entries.length;
        }
        return true; // held; attendance not recorded
      }).length;
      return share(
        ok,
        ms.length,
        'board and committee meetings held on time with quorum',
      );
    });

    add('grc.risk_register_currency', async () => {
      const rs = await this.rows('grc_risks', tid, {
        status: { $ne: 'Closed' },
      });
      const ok = rs.filter((r) =>
        r.nextReviewDate
          ? new Date(r.nextReviewDate) >= now
          : r.updatedAt && new Date(r.updatedAt) >= c.yearAgo,
      ).length;
      return share(ok, rs.length, 'open risks within their review cycle');
    });

    add('grc.policy_review_rate', async () => {
      const ps = await this.rows('grc_policies', tid, { status: 'Published' });
      const ok = ps.filter((p) =>
        p.nextReviewDue
          ? new Date(p.nextReviewDue) >= now
          : p.updatedAt && new Date(p.updatedAt) >= c.yearAgo,
      ).length;
      return share(
        ok,
        ps.length,
        'published policies within their review period',
      );
    });

    add('grc.compliance_checklist_completion', async () => {
      const os = await this.rows('compliance_obligations', tid);
      const done = os.filter((o) => o.status === 'Compliant').length;
      const late = os.filter((o) => o.status === 'Overdue').length;
      return share(
        done,
        done + late,
        'compliance obligations completed on time',
      );
    });

    add('grc.audit_findings_closure', async () => {
      const audits = await this.rows('compliance_audits', tid);
      let closed = 0;
      let late = 0;
      for (const a of audits)
        for (const f of a.findings ?? []) {
          if (['Closed', 'Remediated'].includes(f.status)) closed++;
          else if (f.remediationDueDate && new Date(f.remediationDueDate) < now)
            late++;
        }
      return share(
        closed,
        closed + late,
        'audit findings resolved within the remediation period',
      );
    });

    add('grc.regulatory_filing_timeliness', async () => {
      const fs = await this.rows('compliance_filings', tid, {
        dueDate: { $gte: yearAgo, $lt: now },
      });
      const ok = fs.filter(
        (f) =>
          f.stage === 'Completed' &&
          f.completedAt &&
          new Date(f.completedAt) <= new Date(f.dueDate),
      ).length;
      return share(
        ok,
        fs.length,
        'regulatory filings submitted by their deadline',
      );
    });

    add('grc.board_composition_compliance', async () => {
      const bm = await this.rows('grc_board_members', tid, {
        lifecycleStatus: 'Active',
      });
      const voting = bm.filter((b) => !/secretary/i.test(b.role));
      if (!voting.length) return null;
      const nonExec = (b: any) =>
        ['Non-Executive Director', 'Independent Director'].includes(b.role);
      const checks = [
        voting.length >= 3,
        voting.filter(nonExec).length * 2 > voting.length,
        voting.some((b) => b.role === 'Independent Director'),
        voting.some((b) => b.role === 'Chair'),
      ];
      const ok = checks.filter(Boolean).length;
      return share(ok, checks.length, 'board composition checks met');
    });

    add('grc.declarations_of_interest', async () => {
      const bm = (
        await this.rows('grc_board_members', tid, { lifecycleStatus: 'Active' })
      ).filter((b) => !/secretary/i.test(b.role));
      const filed = bm.filter(
        (b) =>
          (b.documentsCoiDeclaration?.submittedAt &&
            new Date(b.documentsCoiDeclaration.submittedAt) >= c.yearAgo) ||
          (b.conflicts ?? []).some(
            (x: any) => x.disclosedAt && new Date(x.disclosedAt) >= c.yearAgo,
          ),
      ).length;
      return share(
        filed,
        bm.length,
        'directors with a current declaration of interest',
      );
    });

    add('grc.bcp_dr_readiness', async () => {
      const [plans, tests] = await Promise.all([
        this.rows('grc_bcp_plans', tid),
        this.rows('grc_bcp_tests', tid, { testedAt: { $gte: c.yearAgo } }),
      ]);
      if (!plans.length && !tests.length) return null;
      const checks = [
        plans.some((p) => p.status === 'Approved'),
        tests.length > 0,
        plans.length > 0 &&
          !plans.some(
            (p) => p.nextReviewDate && new Date(p.nextReviewDate) < now,
          ),
      ];
      const ok = checks.filter(Boolean).length;
      return share(
        ok,
        checks.length,
        'BCP/DR readiness checks met (approved plan, tested in 12 months, reviews up to date)',
      );
    });

    add('grc.bcp_rto_rpo_compliance', async () => {
      const sys = (await this.rows('grc_rto_rpo', tid)).filter(
        (s) => s.rtoActualHours != null && s.rpoActualHours != null,
      );
      const ok = sys.filter(
        (s) => s.rtoActualHours <= s.rtoHours && s.rpoActualHours <= s.rpoHours,
      ).length;
      return share(
        ok,
        sys.length,
        'tested systems meeting their recovery time and point objectives',
      );
    });

    add('grc.esg_reporting_compliance', async () => {
      const ind = await this.rows('esg_report_indicators', tid, {
        isApplicable: { $ne: false },
      });
      const ok = ind.filter((i) => i.status === 'Signed off').length;
      return share(ok, ind.length, 'applicable ESG disclosures signed off');
    });

    add('grc.esg_target_progress', async () => {
      const ms = await this.rows('esg_metrics', tid);
      const prog = (m: any) => {
        const span = m.baseline - m.target;
        if (span === 0) return m.value === m.target ? 100 : 0;
        return Math.max(
          0,
          Math.min(100, ((m.baseline - m.value) / span) * 100),
        );
      };
      const ok = ms.filter((m) => prog(m) >= 50).length;
      return share(
        ok,
        ms.length,
        'ESG targets at least half way from baseline',
      );
    });
  }

  // ── Finance ────────────────────────────────────────────────────
  private finance(add: Add, c: Ctx) {
    const { tid, now, yearAgo, pack } = c;
    const ratio = (key: string): number | null => {
      for (const g of pack?.ratios ?? [])
        for (const it of g.items) if (it.key === key) return it.value;
      return null;
    };
    const fromPack =
      (fn: (p: NonNullable<Ctx['pack']>) => HsMeasured | null) => async () =>
        pack ? fn(pack) : null;

    add(
      'finance.current_ratio',
      fromPack(() => {
        const v = ratio('currentRatio');
        return v === null
          ? null
          : {
              value: r1(v * 100) / 100,
              basis:
                'Current assets ÷ current liabilities on the balance sheet',
              sample: 1,
            };
      }),
    );

    add('finance.vendor_payment_timeliness', async () => {
      const bills = await this.rows('crm_bills', tid, {
        dueOn: { $gte: yearAgo, $lt: now },
        status: { $nin: ['Rejected', 'Awaiting approval'] },
      });
      const ok = bills.filter(
        (b) =>
          b.status === 'Paid' &&
          b.paidAt &&
          new Date(b.paidAt) <= new Date(new Date(b.dueOn).getTime() + DAY),
      ).length;
      return share(ok, bills.length, 'vendor bills paid by their due date');
    });

    add('finance.tax_filing_compliance', async () => {
      const t = await this.rows('crm_tax_obligations', tid, {
        dueOn: { $gte: yearAgo, $lt: now },
      });
      const ok = t.filter(
        (x) =>
          x.status === 'Filed' &&
          x.filedAt &&
          new Date(x.filedAt) <= new Date(new Date(x.dueOn).getTime() + DAY),
      ).length;
      return share(ok, t.length, 'tax obligations filed by their due date');
    });

    add(
      'finance.budget_variance',
      fromPack((p) => {
        if (!p.budget?.hasBudget) return null;
        const opex = p.budget.totals.operatingExpenses;
        const cos = p.budget.totals.costOfServices;
        const budget = (opex?.budget ?? 0) + (cos?.budget ?? 0);
        const actual = (opex?.actual ?? 0) + (cos?.actual ?? 0);
        if (budget <= 0.005) return null;
        const variance = (Math.abs(actual - budget) / budget) * 100;
        return {
          value: r1(Math.max(0, 100 - variance)),
          basis: `Year-to-date costs are ${r1(variance)}% ${actual > budget ? 'over' : 'under'} budget`,
          sample: 1,
        };
      }),
    );

    add(
      'finance.receivables_aging',
      fromPack((p) => {
        const ar = p.agedReceivables;
        if (!ar || ar.total <= 0.005) return null;
        return {
          value: r1((ar.buckets.current / ar.total) * 100),
          basis: 'Share of unpaid invoices that are not yet past due',
          sample: ar.rows?.length ?? 1,
        };
      }),
    );

    add('finance.financial_reporting_timeliness', async () => {
      const periods = await this.rows('crm_accounting_periods', tid, {
        period: { $regex: `^${now.getUTCFullYear()}-` },
      });
      const ended = this.monthsEnded(now);
      // A firm that does not close its books in the system has nothing to
      // measure here yet — that is not the same as closing late.
      if (!ended.length || !periods.length) return null;
      const ok = ended.filter((m) => {
        const p = periods.find((x) => x.period === m.key);
        return (
          p?.locked &&
          p.lockedAt &&
          new Date(p.lockedAt) <= new Date(m.end.getTime() + 15 * DAY)
        );
      }).length;
      return share(ok, ended.length, 'month-ends closed within 15 days');
    });

    add('finance.audit_readiness', async () => {
      const [periods, recs] = await Promise.all([
        this.rows('crm_accounting_periods', tid, {
          period: { $regex: `^${now.getUTCFullYear()}-` },
        }),
        this.rows('crm_reconciliations', tid, {
          period: { $regex: `^${now.getUTCFullYear()}-` },
        }),
      ]);
      if (!periods.length && !recs.length) return null;
      const ended = this.monthsEnded(now);
      const closed = ended.filter((m) =>
        periods.some((p) => p.period === m.key && p.locked),
      ).length;
      const signed = recs.filter((r) => r.signedOffAt).length;
      const total = ended.length + recs.length;
      return share(
        closed + signed,
        total,
        'ended periods closed and reconciliations signed off',
      );
    });

    add(
      'finance.debt_service_coverage',
      fromPack(() => {
        const v = ratio('interestCover');
        return v === null
          ? null
          : {
              value: r1(v * 100) / 100,
              basis: 'Operating profit ÷ interest expense, year to date',
              sample: 1,
            };
      }),
    );

    add(
      'finance.operating_cashflow_ratio',
      fromPack((p) => {
        const cl = p.balanceSheet?.currentLiabilities;
        const op = p.cashFlow?.ytd?.operating;
        if (!cl || cl <= 0.005 || op == null) return null;
        const months = Math.max(1, p.overview?.kpis ? this.monthsYtd(p) : 1);
        const annual = op * (12 / months);
        return {
          value: r1((annual / cl) * 100) / 100,
          basis: 'Annualised operating cash flow ÷ current liabilities',
          sample: 1,
        };
      }),
    );

    add(
      'finance.cash_burn_runway',
      fromPack((p) => {
        const v = p.overview?.kpis?.runwayMonths;
        return v == null
          ? null
          : {
              value: r1(v),
              basis: 'Cash at bank ÷ average monthly cash costs this year',
              sample: 1,
            };
      }),
    );

    add(
      'finance.revenue_expense_ratio',
      fromPack((p) => {
        const t = p.budget?.totals;
        if (!t) return null;
        const rev = t.revenue?.actual ?? 0;
        const cost =
          (t.costOfServices?.actual ?? 0) + (t.operatingExpenses?.actual ?? 0);
        if (cost <= 0.005) return null;
        return {
          value: r1((rev / cost) * 100) / 100,
          basis: 'Year-to-date revenue ÷ year-to-date costs',
          sample: 1,
        };
      }),
    );

    add(
      'finance.net_cashflow_trend',
      fromPack((p) => {
        const rev = p.overview?.kpis?.revenue;
        const net = p.cashFlow?.period?.netChange;
        if (!rev || rev <= 0.005 || net == null) return null;
        return {
          value: r1((net / rev) * 100),
          basis:
            'Net change in cash this quarter as a share of the quarter’s revenue',
          sample: 1,
        };
      }),
    );
  }

  private monthsEnded(now: Date) {
    const y = now.getUTCFullYear();
    const out: { key: string; end: Date }[] = [];
    for (let m = 0; m < now.getUTCMonth(); m++)
      out.push({
        key: `${y}-${String(m + 1).padStart(2, '0')}`,
        end: new Date(Date.UTC(y, m + 1, 0, 23, 59, 59)),
      });
    return out;
  }

  private monthsYtd(p: any) {
    const from = new Date(p.meta.ytdFrom).getTime();
    const to = Math.min(new Date(p.meta.asOf).getTime(), Date.now());
    return Math.max(1, (to - from) / (DAY * 30.4375));
  }

  // ── HR and Payroll ─────────────────────────────────────────────
  private hr(add: Add, c: Ctx) {
    const { tid, now, yearAgo } = c;
    const current = {
      employmentStatus: {
        $in: ['active', 'on_leave', 'probation', 'suspended'],
      },
    };

    add('hr.contract_compliance', async () => {
      const [emps, contracts] = await Promise.all([
        this.rows('hr_employees', tid, current),
        this.rows('hr_contracts', tid, {
          status: { $in: ['signed', 'countersigned', 'issued'] },
        }),
      ]);
      // No employment contract recorded at all = contracts are not kept
      // in the system yet, so there is nothing to measure.
      if (!contracts.length) return null;
      const has = new Set(contracts.map((x) => String(x.employeeId)));
      const ok = emps.filter((e) => has.has(String(e._id))).length;
      return share(
        ok,
        emps.length,
        'employees with a signed employment contract',
      );
    });

    add('hr.payroll_timeliness', async () => {
      const runs = await this.rows('hr_payroll_runs', tid, {
        periodEnd: { $gte: yearAgo, $lt: new Date(now.getTime() - 5 * DAY) },
      });
      const ok = runs.filter(
        (r) =>
          r.status === 'paid' &&
          r.paidAt &&
          new Date(r.paidAt) <=
            new Date(new Date(r.periodEnd).getTime() + 5 * DAY),
      ).length;
      return share(
        ok,
        runs.length,
        'payroll runs paid within 5 days of period end',
      );
    });

    add('hr.statutory_deductions', async () => {
      const [slips, tax] = await Promise.all([
        this.rows('hr_payslips', tid, { periodEnd: { $gte: yearAgo } }),
        this.rows('crm_tax_obligations', tid, {
          type: { $in: ['PAYE remittance', 'RSSB contributions'] },
          dueOn: { $gte: yearAgo, $lt: now },
        }),
      ]);
      const withLines = slips.filter(
        (s) => (s.deductions ?? []).length > 0,
      ).length;
      const filedOnTime = tax.filter(
        (x) =>
          x.status === 'Filed' &&
          x.filedAt &&
          new Date(x.filedAt) <= new Date(new Date(x.dueOn).getTime() + DAY),
      ).length;
      return share(
        withLines + filedOnTime,
        slips.length + tax.length,
        'payslips with statutory deductions and PAYE/RSSB filings made on time',
      );
    });

    add('hr.leave_compliance', async () => {
      const [emps, pending] = await Promise.all([
        this.rows('hr_employees', tid, current),
        this.rows('hr_leave_requests', tid, {
          status: 'pending',
          createdAt: { $lt: new Date(now.getTime() - 14 * DAY) },
        }),
      ]);
      const within = emps.filter(
        (e) => (e.annualLeaveUsed ?? 0) <= (e.annualLeaveBalance ?? 0),
      ).length;
      const stale = Math.min(pending.length, emps.length);
      return share(
        Math.max(0, within - stale),
        emps.length,
        'employees within their leave entitlement with no stale leave requests',
      );
    });

    add('hr.grievance_resolution', async () => {
      const cases = await this.rows('dispute_cases', tid, {
        type: 'grievance',
      });
      let ok = 0;
      let late = 0;
      for (const d of cases) {
        const filed = new Date(d.filedAt ?? d.createdAt).getTime();
        const done = [
          'closed',
          'outcome_recorded',
          'appealed',
          'escalated_external',
        ].includes(d.status);
        const when = new Date(d.updatedAt ?? now).getTime();
        if (done) when - filed <= 30 * DAY ? ok++ : late++;
        else if (now.getTime() - filed > 30 * DAY) late++;
      }
      return share(ok, ok + late, 'grievances resolved within 30 days');
    });

    add('hr.turnover_rate', async () => {
      const emps = await this.rows('hr_employees', tid);
      const headcount = emps.filter(
        (e) =>
          e.employmentStatus !== 'terminated' ||
          (e.endDate && new Date(e.endDate) >= yearAgo),
      ).length;
      if (!headcount) return null;
      const resigned = emps.filter(
        (e) =>
          e.employmentStatus === 'resigned' &&
          e.endDate &&
          new Date(e.endDate) >= yearAgo,
      ).length;
      return {
        value: r1(100 - (resigned / headcount) * 100),
        basis: `${resigned} resignation${resigned === 1 ? '' : 's'} in the last 12 months across ${headcount} staff`,
        sample: headcount,
      };
    });

    add('hr.performance_review_completion', async () => {
      const cycles = await this.rows('hr_review_cycles', tid, {
        status: { $in: ['open', 'closed', 'completed'] },
      });
      if (!cycles.length) return null;
      const ids = cycles.map((x) => x._id);
      const reviews = await this.rows('hr_performance_reviews', tid, {
        reviewCycleId: { $in: ids },
      });
      const ok = reviews.filter((r) => r.status === 'completed').length;
      return share(ok, reviews.length, 'performance reviews completed');
    });

    add('hr.training_completion', async () => {
      const courses = await this.rows('hr_courses', tid, { mandatory: true });
      if (!courses.length) return null;
      const enr = await this.rows('hr_course_enrollments', tid, {
        courseId: { $in: courses.map((x) => x._id) },
      });
      const ok = enr.filter((e) => e.status === 'completed').length;
      return share(ok, enr.length, 'mandatory course enrolments completed');
    });
  }

  // ── CRM and Projects ───────────────────────────────────────────
  private crm(add: Add, c: Ctx) {
    const { tid, now, yearAgo, pack } = c;

    add('crm.project_on_time', async () => {
      const ms = await this.rows('crm_mandates', tid, {
        targetDate: { $lt: now },
      });
      const ok = ms.filter(
        (m) => m.stage === 'Close' || (m.progress ?? 0) >= 100,
      ).length;
      return share(
        ok,
        ms.length,
        'projects past their target date that were delivered',
      );
    });

    add('crm.client_satisfaction', async () => {
      const t = await this.rows('crm_tickets', tid, {
        rating: { $gte: 1 },
        updatedAt: { $gte: yearAgo },
      });
      if (!t.length) return null;
      const avg = t.reduce((s, x) => s + x.rating, 0) / t.length;
      return {
        value: r1((avg / 5) * 100),
        basis: `Average rating ${avg.toFixed(1)} out of 5 from ${t.length} rated ticket${t.length === 1 ? '' : 's'}`,
        sample: t.length,
      };
    });

    add('crm.dispute_rate', async () => {
      const [ms, adr, lit] = await Promise.all([
        this.rows('crm_mandates', tid, { stage: { $ne: 'Close' } }),
        this.rows('crm_adr_cases', tid, {
          status: { $in: ['Active', 'Escalated to litigation'] },
        }),
        this.rows('crm_litigation_cases', tid, {
          status: 'Active',
        }),
      ]);
      if (!ms.length) return null;
      const disputed = new Set(
        [...adr, ...lit].map((x) => String(x.mandateId ?? '')).filter(Boolean),
      );
      const n = ms.filter((m) => disputed.has(String(m._id))).length;
      return {
        value: r1(100 - (n / ms.length) * 100),
        basis: `${n} of ${ms.length} active projects have an open dispute`,
        sample: ms.length,
      };
    });

    add('crm.contract_renewal_rate', async () => {
      const cs = await this.rows('crm_tools_contracts', tid, {
        origin: 'crm',
        clientId: { $ne: null },
      });
      const due = cs.filter(
        (x) =>
          x.expiresOn &&
          new Date(x.expiresOn) >= yearAgo &&
          new Date(x.expiresOn) < now,
      );
      if (!due.length) return null;
      const renewed = due.filter(
        (x) =>
          x.stage === 'Renewal' ||
          cs.some(
            (y) =>
              String(y._id) !== String(x._id) &&
              String(y.clientId) === String(x.clientId) &&
              y.type === x.type &&
              new Date(y.createdAt) >= new Date(x.expiresOn),
          ),
      ).length;
      return share(renewed, due.length, 'expired client contracts renewed');
    });

    add('crm.revenue_collection', async () => {
      const rate = pack
        ? (pack.ratios ?? [])
            .flatMap((g: any) => g.items)
            .find((i: any) => i.key === 'collection')?.value
        : null;
      return rate == null
        ? null
        : {
            value: r1(rate * 100),
            basis: 'Cash collected ÷ amounts invoiced this year',
            sample: 1,
          };
    });

    add('crm.pipeline_health', async () => {
      const annual = pack?.budget?.annualBudget?.revenue;
      if (!annual || annual <= 0.005) return null;
      const leads = await this.rows('crm_leads', tid, { status: 'open' });
      if (!leads.length) return null;
      const weight: Record<string, number> = { hot: 0.6, warm: 0.3, cold: 0.1 };
      const weighted = leads.reduce(
        (s, l) =>
          s +
          (l.estimatedDealValue ?? 0) *
            (weight[String(l.temperature ?? '').toLowerCase()] ?? 0.2),
        0,
      );
      return {
        value: r1((weighted / annual) * 100) / 100,
        basis: `${leads.length} open lead${leads.length === 1 ? '' : 's'}, weighted by temperature, against the annual revenue budget`,
        sample: leads.length,
      };
    });

    add('crm.project_margin', async () => {
      const ms = await this.rows('crm_mandates', tid, { budget: { $gt: 0 } });
      if (!ms.length) return null;
      const ok = ms.filter((m) => {
        const expected =
          m.budget * Math.max(0.05, Math.min(1, (m.progress ?? 0) / 100));
        return m.actualCost <= expected * 1.1;
      }).length;
      return share(
        ok,
        ms.length,
        'projects with cost within 10% of budget for their progress',
      );
    });
  }

  // ── AML / KYC ──────────────────────────────────────────────────
  private aml(add: Add, c: Ctx) {
    const { tid, now } = c;
    const clients = async () =>
      (await this.rows('client_profiles', tid)).filter((p) => !p.isExClient);

    add('aml.kyc_completion', async () => {
      const cl = await clients();
      const ok = cl.filter((p) => p.kycStatus === 'approved').length;
      return share(ok, cl.length, 'clients with an approved KYC profile');
    });

    add('aml.kyc_refresh_compliance', async () => {
      const cl = (await clients()).filter((p) => p.kycStatus === 'approved');
      const months = (lvl: string) =>
        lvl === 'high' || lvl === 'critical' ? 12 : lvl === 'low' ? 36 : 24;
      const ok = cl.filter((p) => {
        const at = p.kycCompletedAt ?? p.verificationCompletedAt;
        if (!at) return false;
        return (
          (now.getTime() - new Date(at).getTime()) / (DAY * 30.4375) <=
          months(p.riskLevel)
        );
      }).length;
      return share(
        ok,
        cl.length,
        'approved KYC profiles refreshed within their risk-based period',
      );
    });

    add('aml.pep_screening', async () => {
      const cl = await clients();
      const ok = cl.filter((p) => !!p.verificationCompletedAt).length;
      return share(
        ok,
        cl.length,
        'clients screened against PEP and sanctions lists',
      );
    });

    add('aml.str_reporting', async () => {
      const strs = await this.rows('str_reports', tid);
      let ok = 0;
      let late = 0;
      for (const s of strs) {
        const raised = new Date(s.createdAt).getTime();
        if (['submitted', 'acknowledged'].includes(s.status)) {
          const at = new Date(s.submittedAt ?? s.updatedAt).getTime();
          at - raised <= 3 * DAY ? ok++ : late++;
        } else if (now.getTime() - raised > 3 * DAY) late++;
      }
      return share(
        ok,
        ok + late,
        'suspicious transaction reports filed within 3 days',
      );
    });

    add('aml.risk_categorisation', async () => {
      const cl = await clients();
      const ok = cl.filter(
        (p) => p.riskLevel && p.riskLevel !== 'unrated',
      ).length;
      return share(ok, cl.length, 'clients with a risk category');
    });

    add('aml.edd_completion', async () => {
      const hi = (await clients()).filter((p) =>
        ['high', 'critical'].includes(p.riskLevel),
      );
      const ok = hi.filter(
        (p) => p.verificationCompletedAt && p.kycStatus === 'approved',
      ).length;
      return share(
        ok,
        hi.length,
        'high-risk clients with enhanced due diligence completed',
      );
    });
  }
}

type Add = (
  key: string,
  fn: () => Promise<HsMeasured | null> | HsMeasured | null,
) => void;
interface Ctx {
  tid: Types.ObjectId;
  now: Date;
  yearAgo: Date;
  pack: any;
}
