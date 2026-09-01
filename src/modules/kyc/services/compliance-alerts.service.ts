import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ComplianceAlert,
  ComplianceAlertDocument,
  AlertStatus,
  AlertType,
  AlertSeverity,
} from '../schemas/compliance-alert.schema';
import {
  UpdateAlertDto,
  CreateManualAlertDto,
  AlertFilterDto,
} from '../dto/kyc.dto';
import { paginate, PaginationDto } from '../../../common/pagination.dto';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ComplianceAlertsService {
  constructor(
    @InjectModel(ComplianceAlert.name)
    private readonly alertModel: Model<ComplianceAlertDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly mailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Shared: notify client when an alert is raised ─────────
  private async notifyClientOfAlert(
    alert: ComplianceAlertDocument,
  ): Promise<void> {
    // Only notify if alert is linked to a specific client
    if (!alert.clientId) return;

    this.eventEmitter.emit('client.alert.created', {
      tenantId: String(alert.tenantId),
      clientUserId: String(alert.clientId),
      alertId: String(alert._id),
      title: alert.title,
    });

    try {
      const [client, tenant] = await Promise.all([
        this.userModel
          .findById(alert.clientId)
          .select('email firstName tenantId')
          .lean(),
        this.userModel
          .findOne({ userType: 'tenant', _id: alert.tenantId })
          .select('tenantProfile.businessName')
          .lean(),
      ]);

      if (!client) return;

      const businessName =
        (tenant as any)?.tenantProfile?.businessName || 'Your Provider';

      await this.mailService.sendComplianceAlert({
        to: (client as any).email,
        firstName: (client as any).firstName,
        tenantBusinessName: businessName,
        alertTitle: alert.title,
        alertType: alert.type,
        alertSeverity: alert.severity,
        alertDescription: alert.description,
        loginUrl: `${process.env.CLIENT_APP_URL}/login`,
      });
    } catch (err) {
      // Fire-and-forget — email failure must not block alert creation
      console.error(
        'Failed to notify client of compliance alert:',
        err.message,
      );
    }
  }

  async getAlertStats(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const [byStatus, bySeverity, byType, recentCritical] = await Promise.all([
      this.alertModel.aggregate([
        { $match: { tenantId: tId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.alertModel.aggregate([
        { $match: { tenantId: tId, status: AlertStatus.OPEN } },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ]),
      this.alertModel.aggregate([
        { $match: { tenantId: tId, status: AlertStatus.OPEN } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.alertModel
        .find({
          tenantId: tId,
          status: AlertStatus.OPEN,
          severity: { $in: [AlertSeverity.CRITICAL, AlertSeverity.HIGH] },
        })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('clientId', 'firstName lastName email')
        .lean(),
    ]);

    const statusMap = byStatus.reduce(
      (m, s) => ({ ...m, [s._id]: s.count }),
      {} as Record<string, number>,
    );
    const severityMap = bySeverity.reduce(
      (m, s) => ({ ...m, [s._id]: s.count }),
      {} as Record<string, number>,
    );

    return {
      summary: {
        open:
          (statusMap[AlertStatus.OPEN] ?? 0) +
          (statusMap[AlertStatus.ACKNOWLEDGED] ?? 0),
        reviewed: statusMap[AlertStatus.REVIEWED] ?? 0,
        dismissed: statusMap[AlertStatus.DISMISSED] ?? 0,
        escalated: statusMap[AlertStatus.ESCALATED] ?? 0,
        critical: severityMap[AlertSeverity.CRITICAL] ?? 0,
        high: severityMap[AlertSeverity.HIGH] ?? 0,
      },
      byType,
      recentCritical,
    };
  }

  async getAlerts(
    tenantId: string,
    pagination: PaginationDto,
    filters: AlertFilterDto,
  ) {
    const { skip, limit, page } = pagination;
    const query: any = { tenantId: new Types.ObjectId(tenantId) };

    if (filters.status) {
      if (filters.status === AlertStatus.OPEN) {
        query.status = { $in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] };
      } else {
        query.status = filters.status;
      }
    }
    if (filters.severity) query.severity = filters.severity;
    if (filters.type) query.type = filters.type;

    const [items, total] = await Promise.all([
      this.alertModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ status: 1, createdAt: -1 })
        .populate('clientId', 'firstName lastName email')
        .populate('reviewedBy', 'firstName lastName email')
        .lean(),
      this.alertModel.countDocuments(query),
    ]);

    return paginate(items, total, page, limit);
  }

  async getAlertById(alertId: string, tenantId: string) {
    const alert = await this.alertModel
      .findOne({ _id: alertId, tenantId: new Types.ObjectId(tenantId) })
      .populate('clientId', 'firstName lastName email phone')
      .populate('reviewedBy', 'firstName lastName email')
      .lean();
    if (!alert) throw new NotFoundException('Alert not found');
    return alert;
  }

  async createManualAlert(
    tenantId: string,
    createdBy: string,
    dto: CreateManualAlertDto,
  ) {
    if (dto.clientId) {
      const client = await this.userModel.findOne({
        _id: dto.clientId,
        tenantId: new Types.ObjectId(tenantId),
      });
      if (!client) throw new NotFoundException('Client not found');
    }

    const alert = await this.alertModel.create({
      tenantId: new Types.ObjectId(tenantId),
      clientId: dto.clientId ? new Types.ObjectId(dto.clientId) : null,
      type: AlertType.MANUAL,
      severity: dto.severity,
      status: AlertStatus.OPEN,
      title: dto.title,
      description: dto.description,
      metadata: { createdBy },
    });

    await this.notifyClientOfAlert(alert);
    this.eventEmitter.emit('tenant.compliance.alert_created', {
      tenantId,
      clientUserId: dto.clientId ?? null,
      alertId: String(alert._id),
      title: alert.title,
      severity: alert.severity,
    });

    return alert;
  }

  async updateAlert(
    alertId: string,
    tenantId: string,
    reviewedBy: string,
    dto: UpdateAlertDto,
  ) {
    const alert = await this.alertModel.findOne({
      _id: alertId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!alert) throw new NotFoundException('Alert not found');

    return this.alertModel
      .findByIdAndUpdate(
        alertId,
        {
          status: dto.status,
          reviewedBy: new Types.ObjectId(reviewedBy),
          reviewedAt: new Date(),
          reviewNote: dto.reviewNote ?? null,
        },
        { new: true },
      )
      .populate('clientId', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName email');
  }

  async bulkDismiss(
    alertIds: string[],
    tenantId: string,
    reviewedBy: string,
    note?: string,
  ) {
    const result = await this.alertModel.updateMany(
      {
        _id: { $in: alertIds.map((id) => new Types.ObjectId(id)) },
        tenantId: new Types.ObjectId(tenantId),
        status: AlertStatus.OPEN,
      },
      {
        status: AlertStatus.DISMISSED,
        reviewedBy: new Types.ObjectId(reviewedBy),
        reviewedAt: new Date(),
        reviewNote: note ?? 'Bulk dismissed',
      },
    );
    return { success: true, dismissed: result.modifiedCount };
  }

  async getClientAlerts(clientId: string, tenantId: string) {
    return this.alertModel
      .find({
        clientId: new Types.ObjectId(clientId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .sort({ createdAt: -1 })
      .populate('reviewedBy', 'firstName lastName email')
      .lean();
  }
}
