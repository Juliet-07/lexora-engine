import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ClientProfileRecord,
  ClientProfileDocument,
} from '../../tenant/schemas/client-profile.schema';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import {
  ComplianceAlert,
  ComplianceAlertDocument,
  AlertStatus,
} from '../schemas/compliance-alert.schema';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
} from '../schemas/transaction.schema';
import {
  SuspiciousTransactionReport,
  StrDocument,
  StrStatus,
} from '../schemas/str.schema';
import { AccountStatus } from '../../../common/interfaces/user-role.enum';

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(ClientProfileRecord.name)
    private readonly profileModel: Model<ClientProfileDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(ComplianceAlert.name)
    private readonly alertModel: Model<ComplianceAlertDocument>,
    @InjectModel(Transaction.name)
    private readonly txModel: Model<TransactionDocument>,
    @InjectModel(SuspiciousTransactionReport.name)
    private readonly strModel: Model<StrDocument>,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // OPERATIONAL REPORTS
  // Alerts generated/resolved, STRs filed, avg resolution time,
  // daily alert trend
  // ═══════════════════════════════════════════════════════════

  async getOperationalReport(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const now = new Date();
    const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const prev30 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [
      alertsThisPeriod,
      alertsPrevPeriod,
      resolvedThisPeriod,
      resolvedPrevPeriod,
      strThisPeriod,
      strPrevPeriod,
      dailyAlertTrend,
      avgResolutionMs,
    ] = await Promise.all([
      // Alerts generated this period
      this.alertModel.countDocuments({
        tenantId: tId,
        createdAt: { $gte: last30 },
      }),

      // Alerts generated previous period (for % change)
      this.alertModel.countDocuments({
        tenantId: tId,
        createdAt: { $gte: prev30, $lt: last30 },
      }),

      // Alerts resolved (reviewed + dismissed) this period
      this.alertModel.countDocuments({
        tenantId: tId,
        reviewedAt: { $gte: last30 },
        status: { $in: [AlertStatus.REVIEWED, AlertStatus.DISMISSED] },
      }),

      // Alerts resolved previous period
      this.alertModel.countDocuments({
        tenantId: tId,
        reviewedAt: { $gte: prev30, $lt: last30 },
        status: { $in: [AlertStatus.REVIEWED, AlertStatus.DISMISSED] },
      }),

      // STRs filed (submitted + acknowledged) this period
      this.strModel.countDocuments({
        tenantId: tId,
        submittedAt: { $gte: last30 },
        status: { $in: [StrStatus.SUBMITTED, StrStatus.ACKNOWLEDGED] },
      }),

      // STRs filed previous period
      this.strModel.countDocuments({
        tenantId: tId,
        submittedAt: { $gte: prev30, $lt: last30 },
        status: { $in: [StrStatus.SUBMITTED, StrStatus.ACKNOWLEDGED] },
      }),

      // Daily alert trend — last 30 days
      this.alertModel.aggregate([
        { $match: { tenantId: tId, createdAt: { $gte: last30 } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Avg resolution time in ms (reviewedAt - createdAt)
      this.alertModel.aggregate([
        {
          $match: {
            tenantId: tId,
            reviewedAt: { $ne: null, $gte: last30 },
            status: { $in: [AlertStatus.REVIEWED, AlertStatus.DISMISSED] },
          },
        },
        {
          $project: {
            resolutionMs: {
              $subtract: ['$reviewedAt', '$createdAt'],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgMs: { $avg: '$resolutionMs' },
            prevAvgMs: { $avg: '$resolutionMs' },
          },
        },
      ]),
    ]);

    // Build a full 30-day date series so gaps show as 0
    const trendMap = dailyAlertTrend.reduce(
      (m: Record<string, number>, d: any) => ({ ...m, [d._id]: d.count }),
      {},
    );
    const fullTrend = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(last30.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split('T')[0];
      return { date: key, label: `D${i + 1}`, count: trendMap[key] ?? 0 };
    });

    // % change helpers
    const pctChange = (curr: number, prev: number) =>
      prev === 0 ? null : Math.round(((curr - prev) / prev) * 100);

    // Avg resolution in days
    const avgResolutionDays = avgResolutionMs[0]?.avgMs
      ? Math.round((avgResolutionMs[0].avgMs / (1000 * 60 * 60 * 24)) * 10) / 10
      : null;

    return {
      period: 'last_30_days',
      summary: {
        alertsGenerated: {
          value: alertsThisPeriod,
          change: pctChange(alertsThisPeriod, alertsPrevPeriod),
        },
        alertsResolved: {
          value: resolvedThisPeriod,
          change: pctChange(resolvedThisPeriod, resolvedPrevPeriod),
        },
        casesCreated: {
          // cases = STRs in our system
          value: strThisPeriod,
          change: pctChange(strThisPeriod, strPrevPeriod),
        },
        casesClosed: {
          value: await this.strModel.countDocuments({
            tenantId: tId,
            acknowledgedAt: { $gte: last30 },
          }),
          change: null,
        },
        strsFiled: {
          value: strThisPeriod,
          change: strPrevPeriod > 0 ? strThisPeriod - strPrevPeriod : null,
        },
        avgResolutionDays: {
          value: avgResolutionDays,
          change: null,
        },
      },
      dailyAlertTrend: fullTrend,
      generatedAt: new Date(),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // RISK ANALYTICS
  // Client risk distribution, verification outcomes,
  // top risk factors, high-risk client list
  // ═══════════════════════════════════════════════════════════

  async getRiskAnalytics(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      riskDistribution,
      kycStatusBreakdown,
      verificationOutcomes,
      topRiskFactors,
      highRiskClients,
      riskTrend,
      recentlyFlagged,
    ] = await Promise.all([
      // Risk level distribution
      this.profileModel.aggregate([
        { $match: { tenantId: tId } },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        { $match: { 'user.status': { $ne: AccountStatus.INACTIVE } } },
        { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),

      // KYC status breakdown
      this.profileModel.aggregate([
        { $match: { tenantId: tId } },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        { $match: { 'user.status': { $ne: AccountStatus.INACTIVE } } },
        { $group: { _id: '$kycStatus', count: { $sum: 1 } } },
      ]),

      // Verification outcomes — how many PEP / sanctions / adverse media hits
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
        {
          $group: {
            _id: '$checks.k',
            flagged: {
              $sum: {
                $cond: [{ $eq: ['$checks.v.status', 'flagged'] }, 1, 0],
              },
            },
            passed: {
              $sum: {
                $cond: [{ $eq: ['$checks.v.status', 'passed'] }, 1, 0],
              },
            },
            failed: {
              $sum: {
                $cond: [{ $eq: ['$checks.v.status', 'failed'] }, 1, 0],
              },
            },
          },
        },
        { $sort: { flagged: -1 } },
      ]),

      // Top risk factors (most flagged checks)
      this.profileModel.aggregate([
        {
          $match: {
            tenantId: tId,
            verificationResults: { $ne: null },
          },
        },
        { $project: { checks: { $objectToArray: '$verificationResults' } } },
        { $unwind: '$checks' },
        { $match: { 'checks.v.status': 'flagged' } },
        { $group: { _id: '$checks.k', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),

      // High risk client list
      this.profileModel.aggregate([
        {
          $match: {
            tenantId: tId,
            riskLevel: { $in: ['high', 'critical'] },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user',
          },
        },
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
        { $limit: 20 },
      ]),

      // Risk score trend over last 6 months
      this.profileModel.aggregate([
        {
          $match: {
            tenantId: tId,
            verificationCompletedAt: {
              $gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000),
            },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$verificationCompletedAt' },
              month: { $month: '$verificationCompletedAt' },
            },
            avgScore: { $avg: '$verificationResults.riskScore.score' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),

      // Clients newly flagged in last 30 days
      this.profileModel.aggregate([
        {
          $match: {
            tenantId: tId,
            riskLevel: { $in: ['high', 'critical'] },
            verificationCompletedAt: { $gte: last30 },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        {
          $project: {
            clientId: '$userId',
            fullName: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
            email: '$user.email',
            riskLevel: 1,
            verificationCompletedAt: 1,
          },
        },
        { $sort: { verificationCompletedAt: -1 } },
      ]),
    ]);

    const riskMap = riskDistribution.reduce(
      (m: any, r: any) => ({ ...m, [r._id]: r.count }),
      {},
    );
    const total = Object.values(riskMap).reduce(
      (s: number, v: any) => s + v,
      0,
    ) as number;

    return {
      summary: {
        totalClients: total,
        critical: riskMap['critical'] ?? 0,
        high: riskMap['high'] ?? 0,
        medium: riskMap['medium'] ?? 0,
        low: riskMap['low'] ?? 0,
        unrated: riskMap['unrated'] ?? 0,
      },
      riskDistribution,
      kycStatusBreakdown,
      verificationOutcomes,
      topRiskFactors,
      highRiskClients,
      riskTrend,
      recentlyFlagged,
      generatedAt: new Date(),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // REGULATORY DASHBOARD
  // FIU-facing metrics — STR stats, overdue reviews,
  // sanctions/PEP hit list, watchlist screening summary
  // ═══════════════════════════════════════════════════════════

  async getRegulatoryDashboard(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      strStats,
      overdueReviews,
      sanctionHits,
      pepHits,
      pendingAlerts,
      strList,
    ] = await Promise.all([
      // STR stats
      Promise.all([
        this.strModel.countDocuments({
          tenantId: tId,
          status: StrStatus.DRAFT,
        }),
        this.strModel.countDocuments({
          tenantId: tId,
          status: StrStatus.PENDING_REVIEW,
        }),
        this.strModel.countDocuments({
          tenantId: tId,
          status: StrStatus.SUBMITTED,
        }),
        this.strModel.countDocuments({
          tenantId: tId,
          status: StrStatus.ACKNOWLEDGED,
        }),
        this.strModel.countDocuments({ tenantId: tId }),
      ]),

      // Overdue periodic reviews (approved > 180 days ago)
      this.profileModel.aggregate([
        {
          $match: {
            tenantId: tId,
            kycStatus: 'approved',
            kycCompletedAt: {
              $lt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
            },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user',
          },
        },
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
        { $sort: { kycCompletedAt: 1 } }, // oldest first
      ]),

      // Clients with sanctions hits
      this.profileModel.countDocuments({
        tenantId: tId,
        'verificationResults.sanctions.status': 'flagged',
      }),

      // Clients with PEP matches
      this.profileModel.countDocuments({
        tenantId: tId,
        'verificationResults.pep.status': 'flagged',
      }),

      // Open compliance alerts count
      this.alertModel.countDocuments({
        tenantId: tId,
        status: AlertStatus.OPEN,
      }),

      // Recent STRs
      this.strModel
        .find({ tenantId: tId })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('clientId', 'firstName lastName email')
        .populate('reportedBy', 'firstName lastName')
        .lean(),
    ]);

    const [draft, pendingReview, submitted, acknowledged, total] = strStats;

    return {
      strSummary: { draft, pendingReview, submitted, acknowledged, total },
      complianceHealth: {
        overdueReviews: overdueReviews.length,
        sanctionHits,
        pepHits,
        openAlerts: pendingAlerts,
      },
      overdueReviews,
      recentStrs: strList,
      generatedAt: new Date(),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // TREND ANALYSIS
  // Client growth, onboarding funnel, alert trend,
  // transaction volume trend, risk level changes over time
  // ═══════════════════════════════════════════════════════════

  async getTrendAnalysis(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const last6M = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);

    const [
      clientGrowth,
      onboardingFunnel,
      alertTrend,
      txVolumeTrend,
      strTrend,
    ] = await Promise.all([
      // Client growth — new clients per month (last 6 months)
      this.userModel.aggregate([
        {
          $match: {
            userType: 'client',
            tenantId: tId,
            createdAt: { $gte: last6M },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),

      // Onboarding funnel — total at each stage (current snapshot)
      this.profileModel.aggregate([
        { $match: { tenantId: tId } },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        { $match: { 'user.status': { $ne: AccountStatus.INACTIVE } } },
        { $group: { _id: '$kycStatus', count: { $sum: 1 } } },
      ]),

      // Alert volume per month (last 6 months)
      this.alertModel.aggregate([
        { $match: { tenantId: tId, createdAt: { $gte: last6M } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            total: { $sum: 1 },
            resolved: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      [AlertStatus.REVIEWED, AlertStatus.DISMISSED],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),

      // Transaction volume per month (last 6 months)
      this.txModel.aggregate([
        { $match: { tenantId: tId, createdAt: { $gte: last6M } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            flagged: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      [TransactionStatus.FLAGGED, TransactionStatus.BLOCKED],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),

      // STR filings per month (last 6 months)
      this.strModel.aggregate([
        { $match: { tenantId: tId, createdAt: { $gte: last6M } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            total: { $sum: 1 },
            submitted: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      [StrStatus.SUBMITTED, StrStatus.ACKNOWLEDGED],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    return {
      clientGrowth,
      onboardingFunnel,
      alertTrend,
      txVolumeTrend,
      strTrend,
      generatedAt: new Date(),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // CSV EXPORT
  // Generates CSV string for any report type
  // ═══════════════════════════════════════════════════════════

  async exportCsv(tenantId: string, reportType: string): Promise<string> {
    switch (reportType) {
      case 'operational': {
        const data = await this.getOperationalReport(tenantId);
        const rows = [
          ['Date', 'Alerts Generated'],
          ...data.dailyAlertTrend.map((d) => [d.date, d.count]),
        ];
        return this.toCsv(rows);
      }

      case 'risk': {
        const data = await this.getRiskAnalytics(tenantId);
        const rows = [
          ['Client', 'Email', 'Risk Level', 'KYC Status'],
          ...data.highRiskClients.map((c: any) => [
            c.fullName,
            c.email,
            c.riskLevel,
            c.kycStatus,
          ]),
        ];
        return this.toCsv(rows);
      }

      case 'regulatory': {
        const data = await this.getRegulatoryDashboard(tenantId);
        const rows = [
          ['STR ID', 'Customer', 'Amount', 'Currency', 'Status', 'Date'],
          ...data.recentStrs.map((s: any) => {
            const client = typeof s.clientId === 'object' ? s.clientId : null;
            return [
              s.strId,
              client
                ? `${client.firstName} ${client.lastName}`
                : s.customerName,
              s.amount,
              s.currency,
              s.status,
              new Date(s.createdAt).toLocaleDateString(),
            ];
          }),
        ];
        return this.toCsv(rows);
      }

      case 'trends': {
        const data = await this.getTrendAnalysis(tenantId);
        const MONTHS = [
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ];
        const rows = [
          ['Month', 'New Clients', 'Alerts', 'Transactions', 'STRs Filed'],
        ];

        // Merge all monthly data by year-month key
        const merge: Record<string, any> = {};
        data.clientGrowth.forEach((d: any) => {
          const k = `${d._id.year}-${String(d._id.month).padStart(2, '0')}`;
          merge[k] = {
            ...merge[k],
            newClients: d.count,
            month: `${MONTHS[d._id.month - 1]} ${d._id.year}`,
          };
        });
        data.alertTrend.forEach((d: any) => {
          const k = `${d._id.year}-${String(d._id.month).padStart(2, '0')}`;
          merge[k] = { ...merge[k], alerts: d.total };
        });
        data.txVolumeTrend.forEach((d: any) => {
          const k = `${d._id.year}-${String(d._id.month).padStart(2, '0')}`;
          merge[k] = { ...merge[k], transactions: d.count };
        });
        data.strTrend.forEach((d: any) => {
          const k = `${d._id.year}-${String(d._id.month).padStart(2, '0')}`;
          merge[k] = { ...merge[k], strs: d.submitted };
        });

        Object.keys(merge)
          .sort()
          .forEach((k) => {
            const m = merge[k];
            rows.push([
              m.month ?? k,
              m.newClients ?? 0,
              m.alerts ?? 0,
              m.transactions ?? 0,
              m.strs ?? 0,
            ]);
          });

        return this.toCsv(rows);
      }

      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }
  }

  private toCsv(rows: any[][]): string {
    return rows
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? '');
            return s.includes(',') || s.includes('"') || s.includes('\n')
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          })
          .join(','),
      )
      .join('\n');
  }
}
