import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SuspiciousTransactionReport,
  StrDocument,
  StrStatus,
} from '../schemas/str.schema';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { CreateStrDto, UpdateStrDto, SubmitStrDto } from '../dto/kyc.dto';
import { paginate, PaginationDto } from '../../../common/pagination.dto';

@Injectable()
export class StrService {
  constructor(
    @InjectModel(SuspiciousTransactionReport.name)
    private readonly strModel: Model<StrDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // STR STATS
  // ═══════════════════════════════════════════════════════════

  async getStats(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const [draft, pendingReview, submitted, acknowledged, total] =
      await Promise.all([
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
      ]);
    return { draft, pendingReview, submitted, acknowledged, total };
  }

  // ═══════════════════════════════════════════════════════════
  // LIST STRs
  // ═══════════════════════════════════════════════════════════

  async getStrs(
    tenantId: string,
    pagination: PaginationDto,
    status?: StrStatus,
  ) {
    const { skip, limit, page } = pagination;
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (status) query.status = status;

    const [items, total] = await Promise.all([
      this.strModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .populate('clientId', 'firstName lastName email')
        .populate('reportedBy', 'firstName lastName email')
        .populate('reviewedBy', 'firstName lastName email')
        .lean(),
      this.strModel.countDocuments(query),
    ]);

    return paginate(items, total, page, limit);
  }

  async getStrById(strId: string, tenantId: string) {
    const str = await this.strModel
      .findOne({ _id: strId, tenantId: new Types.ObjectId(tenantId) })
      .populate('clientId', 'firstName lastName email phone')
      .populate('reportedBy', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName email')
      .populate('transactionId')
      .lean();
    if (!str) throw new NotFoundException('STR not found');
    return str;
  }

  // ═══════════════════════════════════════════════════════════
  // CREATE STR (save as draft or submit directly)
  // ═══════════════════════════════════════════════════════════

  async createStr(tenantId: string, reportedBy: string, dto: CreateStrDto) {
    const client = await this.userModel.findOne({
      _id: dto.clientId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!client) throw new NotFoundException('Client not found');

    // Generate sequential STR ID per tenant: STR001, STR002 ...
    const count = await this.strModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
    });
    const strId = `STR${String(count + 1).padStart(3, '0')}`;

    const str = await this.strModel.create({
      strId,
      tenantId: new Types.ObjectId(tenantId),
      clientId: new Types.ObjectId(dto.clientId),
      transactionId: dto.transactionId
        ? new Types.ObjectId(dto.transactionId)
        : null,
      relatedCaseId: dto.relatedCaseId ?? null,
      customerName: dto.customerName,
      amount: dto.amount,
      currency: dto.currency ?? 'USD',
      transactionDate: new Date(dto.transactionDate),
      bankName: dto.bankName ?? null,
      descriptionOfActivity: dto.descriptionOfActivity,
      additionalInformation: dto.additionalInformation ?? null,
      status: dto.saveAsDraft ? StrStatus.DRAFT : StrStatus.PENDING_REVIEW,
      reportedBy: new Types.ObjectId(reportedBy),
    });

    return str;
  }

  // ═══════════════════════════════════════════════════════════
  // UPDATE STR (only drafts can be edited)
  // ═══════════════════════════════════════════════════════════

  async updateStr(strId: string, tenantId: string, dto: UpdateStrDto) {
    const str = await this.strModel.findOne({
      _id: strId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!str) throw new NotFoundException('STR not found');

    if (str.status !== StrStatus.DRAFT) {
      throw new BadRequestException('Only draft STRs can be edited');
    }

    const updated = await this.strModel.findByIdAndUpdate(
      strId,
      { $set: dto },
      { new: true },
    );
    return updated;
  }

  // ═══════════════════════════════════════════════════════════
  // SUBMIT STR — marks as submitted + generates goAML XML
  // ═══════════════════════════════════════════════════════════

  async submitStr(strId: string, tenantId: string, submittedBy: string) {
    const str = await this.strModel
      .findOne({ _id: strId, tenantId: new Types.ObjectId(tenantId) })
      .populate('clientId', 'firstName lastName email phone')
      .lean();

    if (!str) throw new NotFoundException('STR not found');

    if (
      str.status === StrStatus.SUBMITTED ||
      str.status === StrStatus.ACKNOWLEDGED
    ) {
      throw new BadRequestException('STR has already been submitted');
    }

    // Generate goAML-compatible XML
    const xml = this.generateGoAmlXml(str);

    // Mark as submitted
    await this.strModel.findByIdAndUpdate(strId, {
      status: StrStatus.SUBMITTED,
      submittedAt: new Date(),
      reviewedBy: new Types.ObjectId(submittedBy),
    });

    return {
      success: true,
      message:
        'STR marked as submitted. Download the goAML XML file and upload it to goweb.fic.gov.rw',
      strId: str.strId,
      xml, // returned for frontend to trigger download
    };
  }

  // ═══════════════════════════════════════════════════════════
  // ACKNOWLEDGE STR — after FIC Rwanda responds
  // ═══════════════════════════════════════════════════════════

  async acknowledgeStr(
    strId: string,
    tenantId: string,
    goAmlReference?: string,
  ) {
    const str = await this.strModel.findOneAndUpdate(
      {
        _id: strId,
        tenantId: new Types.ObjectId(tenantId),
        status: StrStatus.SUBMITTED,
      },
      {
        status: StrStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        ...(goAmlReference && { goAmlReference }),
      },
      { new: true },
    );
    if (!str)
      throw new NotFoundException('STR not found or not in submitted state');
    return str;
  }

  // ═══════════════════════════════════════════════════════════
  // GENERATE goAML XML — Rwanda FIC format
  // Based on goAML 4.0 schema used by FIC Rwanda
  // Tenant uploads this XML to goweb.fic.gov.rw
  // ═══════════════════════════════════════════════════════════

  generateGoAmlXml(str: any): string {
    const client = str.clientId as any;
    const reportDate = new Date().toISOString().split('T')[0];
    const txDate = new Date(str.transactionDate).toISOString().split('T')[0];

    return `<?xml version="1.0" encoding="UTF-8"?>
<report xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="goAML.xsd">
  <rentity_id>${str.strId}</rentity_id>
  <rentity_branch>HQ</rentity_branch>
  <submission_code>E</submission_code>
  <report_code>STR</report_code>
  <entity_reference>${str.strId}</entity_reference>
  <fiu_ref_number>${str.goAmlReference ?? ''}</fiu_ref_number>
  <submission_date>${reportDate}</submission_date>
  <currency_code_local>${str.currency}</currency_code_local>
  <report_indicators>
    <indicator>ML</indicator>
  </report_indicators>
  <reason>${this.escapeXml(str.descriptionOfActivity)}</reason>
  <action>${this.escapeXml(str.additionalInformation ?? 'Report submitted via Lexora compliance platform')}</action>
  <transaction>
    <transactionnumber>TXN-${str.strId}</transactionnumber>
    <transaction_location>${str.bankName ?? 'N/A'}</transaction_location>
    <date_transaction>${txDate}</date_transaction>
    <teller>N/A</teller>
    <authorized>N/A</authorized>
    <amount_local>${str.amount}</amount_local>
    <from_funds_code>O</from_funds_code>
    <from_person>
      <first_name>${this.escapeXml(client?.firstName ?? str.customerName.split(' ')[0])}</first_name>
      <last_name>${this.escapeXml((client?.lastName ?? str.customerName.split(' ').slice(1).join(' ')) || 'N/A')}</last_name>
      <email>${this.escapeXml(client?.email ?? '')}</email>
      <phone>${this.escapeXml(client?.phone ?? '')}</phone>
    </from_person>
    <to_funds_code>O</to_funds_code>
    <to_entity>
      <name>${this.escapeXml(str.bankName ?? 'N/A')}</name>
    </to_entity>
  </transaction>
</report>`;
  }

  private escapeXml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // ═══════════════════════════════════════════════════════════
  // GET XML FOR DOWNLOAD (for already-submitted STRs)
  // ═══════════════════════════════════════════════════════════

  async getStrXml(strId: string, tenantId: string): Promise<string> {
    const str = await this.strModel
      .findOne({ _id: strId, tenantId: new Types.ObjectId(tenantId) })
      .populate('clientId', 'firstName lastName email phone')
      .lean();
    if (!str) throw new NotFoundException('STR not found');
    return this.generateGoAmlXml(str);
  }
}
