import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  IpAsset,
  IpAssetDocument,
  IpAssetStatus,
} from '../schemas/ip-asset.schema';
import { User, UserDocument } from 'src/modules/auth/schemas';
import {
  CreateIpAssetDto,
  CreateIpDeadlineDto,
  RenewIpAssetDto,
  UpdateIpAssetDto,
  UpdateIpDeadlineDto,
} from '../dtos/ip-charge.dto';
import { ipDueItems } from '../utils/ip-calendar.util';

const oid = (v: string | Types.ObjectId) => new Types.ObjectId(String(v));
const dateOrNull = (v?: string | null) => (v ? new Date(v) : null);

// Governance → Organisation Structure → Intellectual Property.
//
// Compliance-calendar link: an asset's expiry date and each of its
// deadlines are read straight off this register by ipDueItems() — the
// same function the CRM calendar's Compliance layer (CalendarService)
// and the Renewals & Deadlines tab use — so editing a date here, or
// ticking a deadline off, is instantly what every calendar shows.
@Injectable()
export class IpAssetService {
  constructor(
    @InjectModel(IpAsset.name)
    private readonly model: Model<IpAssetDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  private async baseCurrency(tenantId: string): Promise<string> {
    const t = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.baseCurrency')
      .lean();
    return ((t as any)?.tenantProfile?.baseCurrency || 'USD').toUpperCase();
  }

  private async get(tenantId: string, id: string) {
    const a = await this.model.findOne({ _id: id, tenantId: oid(tenantId) });
    if (!a) throw new NotFoundException('IP asset not found');
    return a;
  }

  async getOverview(tenantId: string) {
    const tId = oid(tenantId);
    const [assets, baseCurrency] = await Promise.all([
      this.model.find({ tenantId: tId }).sort({ name: 1 }).lean(),
      this.baseCurrency(tenantId),
    ]);
    const due = ipDueItems(assets);
    const live = assets.filter((a) => a.status !== IpAssetStatus.ABANDONED);
    return {
      baseCurrency,
      assets,
      renewals: due,
      stats: {
        total: assets.length,
        totalValue: assets.reduce((s, a) => s + (a.value ?? 0), 0),
        registered: assets.filter(
          (a) =>
            a.status === IpAssetStatus.REGISTERED ||
            a.status === IpAssetStatus.ACTIVE,
        ).length,
        pending: assets.filter((a) => a.status === IpAssetStatus.PENDING)
          .length,
        overdue: due.filter((d) => d.urgency === 'overdue').length,
        dueWithin90: due.filter((d) => d.urgency === 'critical').length,
        dueWithin365: due.filter((d) => d.urgency === 'soon').length,
        licensed: live.filter((a) => (a.licensees ?? []).length).length,
      },
    };
  }

  async create(tenantId: string, dto: CreateIpAssetDto) {
    return this.model.create({
      tenantId: oid(tenantId),
      name: dto.name.trim(),
      type: dto.type,
      owner: dto.owner ?? '',
      regNo: dto.regNo ?? '',
      filingDate: dateOrNull(dto.filingDate),
      expiryDate: dateOrNull(dto.expiryDate),
      jurisdiction: dto.jurisdiction ?? '',
      status: dto.status ?? IpAssetStatus.PENDING,
      value: dto.value ?? 0,
      description: dto.description ?? '',
      licensees: (dto.licensees ?? []).map((l) => l.trim()).filter(Boolean),
    });
  }

  async update(tenantId: string, id: string, dto: UpdateIpAssetDto) {
    const a = await this.get(tenantId, id);
    const { filingDate, expiryDate, licensees, ...rest } = dto as any;
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) (a as any)[k] = v;
    }
    if (filingDate !== undefined) a.filingDate = dateOrNull(filingDate);
    if (expiryDate !== undefined) a.expiryDate = dateOrNull(expiryDate);
    if (licensees !== undefined) {
      a.licensees = licensees.map((l: string) => l.trim()).filter(Boolean);
    }
    await a.save();
    return a;
  }

  async remove(tenantId: string, id: string) {
    const res = await this.model.deleteOne({
      _id: id,
      tenantId: oid(tenantId),
    });
    if (!res.deletedCount) throw new NotFoundException('IP asset not found');
    return { success: true };
  }

  // Renew = move the expiry date on, and bring a lapsed/expired asset
  // back to Registered.
  async renew(tenantId: string, id: string, dto: RenewIpAssetDto) {
    const a = await this.get(tenantId, id);
    const next = new Date(dto.newExpiryDate);
    if (a.expiryDate && next <= a.expiryDate) {
      throw new BadRequestException(
        'The new expiry date must be later than the current one.',
      );
    }
    a.expiryDate = next;
    if (
      a.status === IpAssetStatus.EXPIRED ||
      a.status === IpAssetStatus.LAPSED
    ) {
      a.status = IpAssetStatus.REGISTERED;
    }
    await a.save();
    return a;
  }

  // ── Deadlines ───────────────────────────────────────────────────
  async addDeadline(tenantId: string, id: string, dto: CreateIpDeadlineDto) {
    const a = await this.get(tenantId, id);
    a.deadlines.push({
      label: dto.label.trim(),
      dueDate: new Date(dto.dueDate),
      done: false,
      doneAt: null,
    } as any);
    a.markModified('deadlines');
    await a.save();
    return a;
  }

  async updateDeadline(
    tenantId: string,
    id: string,
    deadlineId: string,
    dto: UpdateIpDeadlineDto,
  ) {
    const a = await this.get(tenantId, id);
    const d = a.deadlines.find((x) => String(x._id) === deadlineId);
    if (!d) throw new NotFoundException('Deadline not found');
    if (dto.label !== undefined) d.label = dto.label.trim();
    if (dto.dueDate !== undefined) d.dueDate = new Date(dto.dueDate);
    if (dto.done !== undefined) {
      d.done = dto.done;
      d.doneAt = dto.done ? new Date() : null;
    }
    a.markModified('deadlines');
    await a.save();
    return a;
  }

  async removeDeadline(tenantId: string, id: string, deadlineId: string) {
    const a = await this.get(tenantId, id);
    const before = a.deadlines.length;
    a.deadlines = a.deadlines.filter((x) => String(x._id) !== deadlineId);
    if (a.deadlines.length === before) {
      throw new NotFoundException('Deadline not found');
    }
    a.markModified('deadlines');
    await a.save();
    return a;
  }

  // ── Documents ───────────────────────────────────────────────────
  async addDocument(tenantId: string, id: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Choose a file to upload.');
    const a = await this.get(tenantId, id);
    a.documents.push({
      name: file.originalname,
      fileUrl: `/uploads/grc/ip-assets/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    });
    a.markModified('documents');
    await a.save();
    return a;
  }

  async removeDocument(tenantId: string, id: string, index: number) {
    const a = await this.get(tenantId, id);
    a.documents.splice(index, 1);
    a.markModified('documents');
    await a.save();
    return a;
  }
}
