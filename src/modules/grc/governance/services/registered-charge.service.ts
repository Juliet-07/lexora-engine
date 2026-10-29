import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RegisteredCharge,
  RegisteredChargeDocument,
  ChargeStatus,
} from '../schemas/registered-charge.schema';
import { User, UserDocument } from 'src/modules/auth/schemas';
import {
  CreateChargeDto,
  SatisfyChargeDto,
  UpdateChargeDto,
} from '../dtos/ip-charge.dto';

const oid = (v: string | Types.ObjectId) => new Types.ObjectId(String(v));

// Governance → Organisation Structure → Register of Charges.
@Injectable()
export class RegisteredChargeService {
  constructor(
    @InjectModel(RegisteredCharge.name)
    private readonly model: Model<RegisteredChargeDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  private async get(tenantId: string, id: string) {
    const c = await this.model.findOne({ _id: id, tenantId: oid(tenantId) });
    if (!c) throw new NotFoundException('Charge not found');
    return c;
  }

  async getOverview(tenantId: string) {
    const tId = oid(tenantId);
    const [charges, t] = await Promise.all([
      this.model.find({ tenantId: tId }).sort({ dateCreated: -1 }).lean(),
      this.userModel
        .findById(tenantId)
        .select('tenantProfile.baseCurrency')
        .lean(),
    ]);
    const active = charges.filter((c) => c.status === ChargeStatus.ACTIVE);
    const byType: Record<string, { count: number; amount: number }> = {};
    for (const c of active) {
      const row = (byType[c.chargeType] ??= { count: 0, amount: 0 });
      row.count += 1;
      row.amount += c.amountSecured ?? 0;
    }
    return {
      baseCurrency: (
        (t as any)?.tenantProfile?.baseCurrency || 'USD'
      ).toUpperCase(),
      charges,
      stats: {
        total: charges.length,
        active: active.length,
        satisfied: charges.length - active.length,
        activeAmount: active.reduce((s, c) => s + (c.amountSecured ?? 0), 0),
        totalAmount: charges.reduce((s, c) => s + (c.amountSecured ?? 0), 0),
        byType,
      },
    };
  }

  async create(tenantId: string, dto: CreateChargeDto) {
    const created = new Date(dto.dateCreated);
    const satisfied = dto.dateSatisfied ? new Date(dto.dateSatisfied) : null;
    if (satisfied && satisfied < created) {
      throw new BadRequestException(
        'A charge can’t be satisfied before it was created.',
      );
    }
    return this.model.create({
      tenantId: oid(tenantId),
      chargeType: dto.chargeType,
      chargeHolder: dto.chargeHolder.trim(),
      dateCreated: created,
      dateSatisfied: satisfied,
      amountSecured: dto.amountSecured,
      propertyCharged: dto.propertyCharged ?? '',
      regRef: dto.regRef ?? '',
      description: dto.description ?? '',
      status: satisfied ? ChargeStatus.SATISFIED : ChargeStatus.ACTIVE,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateChargeDto) {
    const c = await this.get(tenantId, id);
    const { dateCreated, dateSatisfied, status, ...rest } = dto as any;
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) (c as any)[k] = v;
    }
    if (dateCreated) c.dateCreated = new Date(dateCreated);
    if (dateSatisfied !== undefined) {
      c.dateSatisfied = dateSatisfied ? new Date(dateSatisfied) : null;
      c.status = c.dateSatisfied ? ChargeStatus.SATISFIED : ChargeStatus.ACTIVE;
    } else if (status) {
      c.status = status;
      if (status === ChargeStatus.ACTIVE) c.dateSatisfied = null;
    }
    if (c.dateSatisfied && c.dateSatisfied < c.dateCreated) {
      throw new BadRequestException(
        'A charge can’t be satisfied before it was created.',
      );
    }
    if (c.status === ChargeStatus.SATISFIED && !c.dateSatisfied) {
      throw new BadRequestException('Enter the date the charge was satisfied.');
    }
    await c.save();
    return c;
  }

  async satisfy(tenantId: string, id: string, dto: SatisfyChargeDto) {
    const c = await this.get(tenantId, id);
    if (c.status === ChargeStatus.SATISFIED) {
      throw new BadRequestException('This charge is already satisfied.');
    }
    const when = new Date(dto.dateSatisfied);
    if (when < c.dateCreated) {
      throw new BadRequestException(
        'A charge can’t be satisfied before it was created.',
      );
    }
    c.dateSatisfied = when;
    c.status = ChargeStatus.SATISFIED;
    await c.save();
    return c;
  }

  async remove(tenantId: string, id: string) {
    const res = await this.model.deleteOne({
      _id: id,
      tenantId: oid(tenantId),
    });
    if (!res.deletedCount) throw new NotFoundException('Charge not found');
    return { success: true };
  }

  async addDocument(tenantId: string, id: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Choose a file to upload.');
    const c = await this.get(tenantId, id);
    c.documents.push({
      name: file.originalname,
      fileUrl: `/uploads/grc/charges/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    });
    c.markModified('documents');
    await c.save();
    return c;
  }

  async removeDocument(tenantId: string, id: string, index: number) {
    const c = await this.get(tenantId, id);
    c.documents.splice(index, 1);
    c.markModified('documents');
    await c.save();
    return c;
  }
}
