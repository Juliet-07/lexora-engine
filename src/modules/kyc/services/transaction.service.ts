import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
} from '../schemas/transaction.schema';
import {
  RiskRule,
  RiskRuleDocument,
  RuleCondition,
  RuleType,
} from '../schemas/risk-rule.schema';
import {
  RiskScenario,
  RiskScenarioDocument,
} from '../schemas/risk-scenario.schema';
import {
  ComplianceAlert,
  ComplianceAlertDocument,
  AlertType,
  AlertSeverity,
  AlertStatus,
} from '../schemas/compliance-alert.schema';
import {
  ClientProfileRecord,
  ClientProfileDocument,
} from '../../tenant/schemas/client-profile.schema';
import {
  LogTransactionDto,
  TransactionFilterDto,
  ReviewTransactionDto,
} from '../dto/kyc.dto';
import { paginate, PaginationDto } from '../../../common/pagination.dto';
import { User, UserDocument } from '../../auth/schemas/user.schema';

@Injectable()
export class TransactionService {
  constructor(
    @InjectModel(Transaction.name)
    private readonly txModel: Model<TransactionDocument>,
    @InjectModel(RiskRule.name)
    private readonly ruleModel: Model<RiskRuleDocument>,
    @InjectModel(RiskScenario.name)
    private readonly scenarioModel: Model<RiskScenarioDocument>,
    @InjectModel(ComplianceAlert.name)
    private readonly alertModel: Model<ComplianceAlertDocument>,
    @InjectModel(ClientProfileRecord.name)
    private readonly profileModel: Model<ClientProfileDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // DASHBOARD STATS
  // ═══════════════════════════════════════════════════════════

  async getDashboard(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);

    const [
      activeRules,
      openAlerts,
      underReview,
      activeScenarios,
      recentFlagged,
      volumeByType,
      flaggedTrend,
    ] = await Promise.all([
      this.ruleModel.countDocuments({
        $or: [{ tenantId: null }, { tenantId: tId }],
        isActive: true,
        ruleType: { $in: ['transaction', 'behavioral'] },
      }),
      this.alertModel.countDocuments({
        tenantId: tId,
        type: AlertType.TRANSACTION_FLAG,
        status: AlertStatus.OPEN,
      }),
      this.txModel.countDocuments({
        tenantId: tId,
        status: TransactionStatus.FLAGGED,
      }),
      this.scenarioModel.countDocuments({ tenantId: tId, isActive: true }),
      // Recent flagged transactions
      this.txModel
        .find({
          tenantId: tId,
          status: {
            $in: [TransactionStatus.FLAGGED, TransactionStatus.BLOCKED],
          },
        })
        .populate('clientId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      // Volume by type
      this.txModel.aggregate([
        { $match: { tenantId: tId } },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
          },
        },
        { $sort: { totalAmount: -1 } },
      ]),
      // Flagged count per day (last 30 days)
      this.txModel.aggregate([
        {
          $match: {
            tenantId: tId,
            status: TransactionStatus.FLAGGED,
            createdAt: {
              $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]),
    ]);

    return {
      stats: { activeRules, openAlerts, underReview, activeScenarios },
      recentFlagged,
      volumeByType,
      flaggedTrend,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // LOG A TRANSACTION
  // ═══════════════════════════════════════════════════════════

  async logTransaction(
    tenantId: string,
    loggedBy: string,
    dto: LogTransactionDto,
  ) {
    const client = await this.userModel.findOne({
      _id: dto.clientId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!client) throw new NotFoundException('Client not found');

    const tx = await this.txModel.create({
      ...dto,
      tenantId: new Types.ObjectId(tenantId),
      clientId: new Types.ObjectId(dto.clientId),
      transactionDate: new Date(dto.transactionDate),
      loggedBy: new Types.ObjectId(loggedBy),
    });

    // Run auto-flag engine
    await this.evaluateTransaction(tx, tenantId);

    return this.txModel
      .findById(tx._id)
      .populate('clientId', 'firstName lastName email')
      .lean();
  }

  // ═══════════════════════════════════════════════════════════
  // AUTO-FLAG ENGINE
  // Evaluates a transaction against all active rules + scenarios
  // ═══════════════════════════════════════════════════════════

  private async evaluateTransaction(tx: TransactionDocument, tenantId: string) {
    const tId = new Types.ObjectId(tenantId);

    // Load all active transaction + behavioral rules
    const rules = await this.ruleModel
      .find({
        $or: [{ tenantId: null }, { tenantId: tId }],
        isActive: true,
        ruleType: { $in: [RuleType.TRANSACTION, RuleType.BEHAVIORAL] },
      })
      .lean();

    const triggeredRules: string[] = [];
    let highestSeverity: TransactionStatus = TransactionStatus.NORMAL;

    for (const rule of rules) {
      let matched = false;

      if (rule.ruleType === RuleType.TRANSACTION) {
        matched = this.evaluateRule(rule, tx);
      } else if (rule.ruleType === RuleType.BEHAVIORAL) {
        matched = await this.evaluateBehavioral(rule, tx, tenantId);
      }

      if (matched) {
        triggeredRules.push(rule.name);

        // Map action to status
        if (rule.action === 'block') {
          highestSeverity = TransactionStatus.BLOCKED;
        } else if (
          (rule.action === 'flag_high' || rule.action === 'flag_medium') &&
          highestSeverity !== TransactionStatus.BLOCKED
        ) {
          highestSeverity = TransactionStatus.FLAGGED;
        } else if (
          rule.action === 'flag_low' &&
          highestSeverity === TransactionStatus.NORMAL
        ) {
          highestSeverity = TransactionStatus.FLAGGED;
        }

        // Create compliance alert for each triggered rule
        if (
          rule.action === 'create_alert' ||
          highestSeverity === TransactionStatus.FLAGGED
        ) {
          const severity =
            rule.action === 'flag_high'
              ? AlertSeverity.HIGH
              : rule.action === 'flag_medium'
                ? AlertSeverity.MEDIUM
                : rule.action === 'block'
                  ? AlertSeverity.CRITICAL
                  : AlertSeverity.LOW;

          await this.alertModel.create({
            tenantId: tId,
            clientId: tx.clientId,
            type: AlertType.TRANSACTION_FLAG,
            severity,
            status: AlertStatus.OPEN,
            title: `Transaction flagged: ${rule.name}`,
            description: `Transaction of ${tx.currency} ${tx.amount} (${tx.type}) triggered rule "${rule.name}"`,
            metadata: {
              transactionId: tx._id,
              amount: tx.amount,
              currency: tx.currency,
              type: tx.type,
              rule: rule.name,
              condition: `${rule.field} ${rule.condition} ${rule.value}`,
            },
          });
        }
      }
    }

    // Update transaction with flag results
    if (triggeredRules.length > 0) {
      await this.txModel.findByIdAndUpdate(tx._id, {
        status: highestSeverity,
        triggeredRules,
      });
    }
  }

  private evaluateRule(rule: any, tx: TransactionDocument): boolean {
    const fieldMap: Record<string, any> = {
      amount: tx.amount,
      currency: tx.currency,
      type: tx.type,
      counterpartyCountry: tx.counterpartyCountry,
    };

    const fieldValue = fieldMap[rule.field];
    if (fieldValue === undefined || fieldValue === null) return false;

    const threshold = isNaN(Number(rule.value))
      ? rule.value
      : Number(rule.value);

    switch (rule.condition) {
      case RuleCondition.GREATER_THAN:
        return Number(fieldValue) > Number(threshold);
      case RuleCondition.LESS_THAN:
        return Number(fieldValue) < Number(threshold);
      case RuleCondition.EQUALS:
        return (
          String(fieldValue).toLowerCase() === String(threshold).toLowerCase()
        );
      case RuleCondition.NOT_EQUALS:
        return (
          String(fieldValue).toLowerCase() !== String(threshold).toLowerCase()
        );
      case RuleCondition.CONTAINS:
        return String(fieldValue)
          .toLowerCase()
          .includes(String(threshold).toLowerCase());
      case RuleCondition.IN_LIST: {
        const list = String(threshold)
          .split(',')
          .map((v) => v.trim().toLowerCase());
        return list.includes(String(fieldValue).toLowerCase());
      }
      default:
        return false;
    }
  }

  private async evaluateBehavioral(
    rule: any,
    tx: TransactionDocument,
    tenantId: string,
  ): Promise<boolean> {
    // Example behavioral rule: transactionCount > 5 in 24h
    if (rule.field === 'transactionCount') {
      const count = await this.txModel.countDocuments({
        tenantId: new Types.ObjectId(tenantId),
        clientId: tx.clientId,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });
      return this.evaluateRule({ ...rule, field: 'amount' }, {
        ...tx,
        amount: count,
      } as any);
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════
  // LIST TRANSACTIONS
  // ═══════════════════════════════════════════════════════════

  async getTransactions(
    tenantId: string,
    pagination: PaginationDto,
    filters: TransactionFilterDto,
  ) {
    const { skip, limit, page } = pagination;
    const query: any = { tenantId: new Types.ObjectId(tenantId) };

    if (filters.status) query.status = filters.status;
    if (filters.type) query.type = filters.type;
    if (filters.clientId) query.clientId = new Types.ObjectId(filters.clientId);
    if (filters.dateFrom || filters.dateTo) {
      query.transactionDate = {};
      if (filters.dateFrom)
        query.transactionDate.$gte = new Date(filters.dateFrom);
      if (filters.dateTo) query.transactionDate.$lte = new Date(filters.dateTo);
    }

    const [items, total] = await Promise.all([
      this.txModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ transactionDate: -1 })
        .populate('clientId', 'firstName lastName email')
        .populate('loggedBy', 'firstName lastName')
        .populate('reviewedBy', 'firstName lastName')
        .lean(),
      this.txModel.countDocuments(query),
    ]);

    return paginate(items, total, page, limit);
  }

  async getTransactionById(txId: string, tenantId: string) {
    const tx = await this.txModel
      .findOne({ _id: txId, tenantId: new Types.ObjectId(tenantId) })
      .populate('clientId', 'firstName lastName email phone')
      .populate('loggedBy', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName email')
      .lean();
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  // ═══════════════════════════════════════════════════════════
  // REVIEW A FLAGGED TRANSACTION
  // ═══════════════════════════════════════════════════════════

  async reviewTransaction(
    txId: string,
    tenantId: string,
    reviewedBy: string,
    dto: ReviewTransactionDto,
  ) {
    const tx = await this.txModel.findOneAndUpdate(
      { _id: txId, tenantId: new Types.ObjectId(tenantId) },
      {
        status: dto.clearFlag
          ? TransactionStatus.REVIEWED
          : TransactionStatus.FLAGGED,
        reviewedBy: new Types.ObjectId(reviewedBy),
        reviewedAt: new Date(),
        reviewNote: dto.note,
      },
      { new: true },
    );
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  // ═══════════════════════════════════════════════════════════
  // WIRE TRANSFER MONITORING — cross-border transactions
  // ═══════════════════════════════════════════════════════════

  async getWireTransfers(tenantId: string, pagination: PaginationDto) {
    const { skip, limit, page } = pagination;
    const tId = new Types.ObjectId(tenantId);

    const [items, total] = await Promise.all([
      this.txModel
        .find({
          tenantId: tId,
          type: {
            $in: [
              'wire_transfer_in',
              'wire_transfer_out',
              'cross_border_transfer',
            ],
          },
        })
        .skip(skip)
        .limit(limit)
        .sort({ transactionDate: -1 })
        .populate('clientId', 'firstName lastName email')
        .lean(),
      this.txModel.countDocuments({
        tenantId: tId,
        type: {
          $in: [
            'wire_transfer_in',
            'wire_transfer_out',
            'cross_border_transfer',
          ],
        },
      }),
    ]);

    return paginate(items, total, page, limit);
  }

  // ═══════════════════════════════════════════════════════════
  // BEHAVIORAL PROFILING — pattern detection per client
  // ═══════════════════════════════════════════════════════════

  async getBehavioralProfile(clientId: string, tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const cId = new Types.ObjectId(clientId);
    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const last7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      total30Days,
      total7Days,
      byType,
      largestTransaction,
      flaggedCount,
      dailyPattern,
    ] = await Promise.all([
      this.txModel.aggregate([
        {
          $match: {
            tenantId: tId,
            clientId: cId,
            transactionDate: { $gte: last30 },
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
          },
        },
      ]),
      this.txModel.aggregate([
        {
          $match: {
            tenantId: tId,
            clientId: cId,
            transactionDate: { $gte: last7 },
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
          },
        },
      ]),
      this.txModel.aggregate([
        { $match: { tenantId: tId, clientId: cId } },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
          },
        },
        { $sort: { totalAmount: -1 } },
      ]),
      this.txModel
        .findOne({ tenantId: tId, clientId: cId })
        .sort({ amount: -1 })
        .lean(),
      this.txModel.countDocuments({
        tenantId: tId,
        clientId: cId,
        status: TransactionStatus.FLAGGED,
      }),
      this.txModel.aggregate([
        {
          $match: {
            tenantId: tId,
            clientId: cId,
            transactionDate: { $gte: last30 },
          },
        },
        {
          $group: {
            _id: { $dayOfWeek: '$transactionDate' },
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return {
      clientId,
      last30Days: total30Days[0] ?? { count: 0, totalAmount: 0 },
      last7Days: total7Days[0] ?? { count: 0, totalAmount: 0 },
      byType,
      largestTransaction,
      flaggedCount,
      dailyPattern,
    };
  }
}
