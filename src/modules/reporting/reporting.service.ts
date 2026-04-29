import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Client } from '../clients/schemas/client.schema';
import { Invoice } from '../billing/schemas/billing.schema';
import { KycRecord } from '../kyc/schemas/kyc-record.schema';
import { Alert, ComplianceCase } from '../compliance/schemas/compliance.schema';
import { Project } from '../projects/schemas/project.schema';

@Injectable()
export class ReportingService {
  constructor(
    @InjectModel(Client.name) private clientModel: Model<any>,
    @InjectModel(Invoice.name) private invoiceModel: Model<any>,
    @InjectModel(KycRecord.name) private kycModel: Model<any>,
    @InjectModel(Alert.name) private alertModel: Model<any>,
    @InjectModel(ComplianceCase.name) private caseModel: Model<any>,
    @InjectModel(Project.name) private projectModel: Model<any>,
  ) {}

  async generateComplianceReport(organizationId: string, fromDate?: string, toDate?: string) {
    const orgId = new Types.ObjectId(organizationId);
    const dateFilter: any = {};
    if (fromDate) dateFilter.$gte = new Date(fromDate);
    if (toDate) dateFilter.$lte = new Date(toDate);
    const createdAt = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};

    const [
      kycStats,
      alertStats,
      caseStats,
      clientRiskDistribution,
    ] = await Promise.all([
      this.kycModel.aggregate([
        { $match: { organizationId: orgId, ...createdAt } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.alertModel.aggregate([
        { $match: { organizationId: orgId, ...createdAt } },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ]),
      this.caseModel.aggregate([
        { $match: { organizationId: orgId, ...createdAt } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.clientModel.aggregate([
        { $match: { organizationId: orgId } },
        { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
      ]),
    ]);

    return {
      reportType: 'compliance',
      generatedAt: new Date(),
      organizationId,
      period: { from: fromDate, to: toDate },
      kycByStatus: this.arrayToObject(kycStats),
      alertsBySeverity: this.arrayToObject(alertStats),
      casesByStatus: this.arrayToObject(caseStats),
      clientsByRisk: this.arrayToObject(clientRiskDistribution),
    };
  }

  async generateFinancialReport(organizationId: string, fromDate?: string, toDate?: string) {
    const orgId = new Types.ObjectId(organizationId);
    const dateFilter: any = {};
    if (fromDate) dateFilter.$gte = new Date(fromDate);
    if (toDate) dateFilter.$lte = new Date(toDate);
    const createdAt = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};

    const [invoiceStats, monthlyRevenue, topClients] = await Promise.all([
      this.invoiceModel.aggregate([
        { $match: { organizationId: orgId, ...createdAt } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total: { $sum: '$totalAmount' },
            paid: { $sum: '$paidAmount' },
          },
        },
      ]),
      this.invoiceModel.aggregate([
        { $match: { organizationId: orgId, status: 'paid', ...createdAt } },
        {
          $group: {
            _id: {
              year: { $year: '$paidAt' },
              month: { $month: '$paidAt' },
            },
            revenue: { $sum: '$paidAmount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      this.invoiceModel.aggregate([
        { $match: { organizationId: orgId, ...createdAt } },
        {
          $group: {
            _id: '$clientId',
            totalInvoiced: { $sum: '$totalAmount' },
            totalPaid: { $sum: '$paidAmount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalPaid: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'clients',
            localField: '_id',
            foreignField: '_id',
            as: 'client',
          },
        },
        { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
      ]),
    ]);

    const totals = invoiceStats.reduce(
      (acc, s) => {
        acc.totalInvoiced += s.total || 0;
        acc.totalPaid += s.paid || 0;
        return acc;
      },
      { totalInvoiced: 0, totalPaid: 0 },
    );

    return {
      reportType: 'financial',
      generatedAt: new Date(),
      organizationId,
      period: { from: fromDate, to: toDate },
      summary: {
        ...totals,
        outstanding: totals.totalInvoiced - totals.totalPaid,
      },
      invoicesByStatus: invoiceStats,
      monthlyRevenue,
      topClients,
    };
  }

  async generateClientReport(organizationId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const [statusDist, typeDist, riskDist, onboardingTrend] = await Promise.all([
      this.clientModel.aggregate([
        { $match: { organizationId: orgId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.clientModel.aggregate([
        { $match: { organizationId: orgId } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      this.clientModel.aggregate([
        { $match: { organizationId: orgId } },
        { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
      ]),
      this.clientModel.aggregate([
        { $match: { organizationId: orgId } },
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
        { $limit: 12 },
      ]),
    ]);

    return {
      reportType: 'client',
      generatedAt: new Date(),
      organizationId,
      byStatus: this.arrayToObject(statusDist),
      byType: this.arrayToObject(typeDist),
      byRiskLevel: this.arrayToObject(riskDist),
      onboardingTrend,
    };
  }

  async generateProjectReport(organizationId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const stats = await this.projectModel.aggregate([
      { $match: { organizationId: orgId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgProgress: { $avg: '$progress' },
          totalBudget: { $sum: '$budget' },
        },
      },
    ]);

    return {
      reportType: 'project',
      generatedAt: new Date(),
      organizationId,
      projectsByStatus: stats,
    };
  }

  async getDashboardSummary(organizationId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const [clients, invoices, alerts, cases, kycs] = await Promise.all([
      this.clientModel.countDocuments({ organizationId: orgId }),
      this.invoiceModel.aggregate([
        { $match: { organizationId: orgId } },
        {
          $group: {
            _id: null,
            totalInvoiced: { $sum: '$totalAmount' },
            totalPaid: { $sum: '$paidAmount' },
            overdueCount: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] } },
          },
        },
      ]),
      this.alertModel.countDocuments({ organizationId: orgId, status: 'open' }),
      this.caseModel.countDocuments({ organizationId: orgId, status: { $in: ['open', 'investigating'] } }),
      this.kycModel.countDocuments({ organizationId: orgId, status: 'pending' }),
    ]);

    return {
      clients: { total: clients },
      billing: invoices[0] || { totalInvoiced: 0, totalPaid: 0, overdueCount: 0 },
      compliance: { openAlerts: alerts, activeCases: cases, pendingKyc: kycs },
    };
  }

  private arrayToObject(arr: Array<{ _id: string; count: number }>) {
    return arr.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as Record<string, number>);
  }
}
