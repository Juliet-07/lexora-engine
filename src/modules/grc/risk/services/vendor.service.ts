import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Vendor, VendorDocument, VendorStatus } from '../schemas';
import {
  CreateVendorDto,
  UpdateVendorRatingDto,
  TerminateVendorDto,
} from '../dtos';

@Injectable()
export class VendorService {
  constructor(
    @InjectModel(Vendor.name)
    private readonly vendorModel: Model<VendorDocument>,
  ) {}

  async create(tenantId: string, dto: CreateVendorDto) {
    return this.vendorModel.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      category: dto.category,
      services: dto.services,
      contractStart: new Date(dto.contractStart),
      contractEnd: new Date(dto.contractEnd),
      riskRating: dto.riskRating,
      dueDiligence: dto.dueDiligence,
      nextReviewDate: new Date(dto.nextReviewDate),
      status: VendorStatus.ACTIVE,
      ratingHistory: [
        { at: new Date(), rating: dto.riskRating, note: 'Initial assessment' },
      ],
    });
  }

  async getAll(tenantId: string) {
    return this.vendorModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  private async getRawDoc(
    tenantId: string,
    id: string,
  ): Promise<VendorDocument> {
    const vendor = await this.vendorModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async updateRating(tenantId: string, id: string, dto: UpdateVendorRatingDto) {
    const vendor = await this.getRawDoc(tenantId, id);
    if (vendor.status === VendorStatus.TERMINATED) {
      throw new BadRequestException(
        'This vendor relationship has been terminated.',
      );
    }
    vendor.riskRating = dto.rating;
    vendor.ratingHistory.push({
      at: new Date(),
      rating: dto.rating,
      note: dto.note,
    } as any);
    vendor.markModified('ratingHistory');
    await vendor.save();
    return vendor;
  }

  async terminate(tenantId: string, id: string, dto: TerminateVendorDto) {
    const vendor = await this.getRawDoc(tenantId, id);
    if (vendor.status === VendorStatus.TERMINATED) {
      throw new BadRequestException('This vendor is already terminated.');
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException('A termination reason is required.');
    }
    vendor.status = VendorStatus.TERMINATED;
    vendor.terminationReason = dto.reason.trim();
    vendor.terminatedAt = new Date();
    await vendor.save();
    return vendor;
  }
}
