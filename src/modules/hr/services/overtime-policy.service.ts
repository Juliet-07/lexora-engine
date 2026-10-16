import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OvertimePolicy,
  OvertimePolicyDocument,
  OvertimePolicyTier,
} from '../schemas';
import { UpsertOvertimePolicyDto } from '../dtos';

@Injectable()
export class OvertimePolicyService {
  constructor(
    @InjectModel(OvertimePolicy.name)
    private readonly policyModel: Model<OvertimePolicyDocument>,
  ) {}

  // ── TENANT — list all policies (one per location + maybe a default) ──

  async getAllPolicies(tenantId: string): Promise<OvertimePolicyDocument[]> {
    return this.policyModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .populate('locationId', 'name country city')
      .sort({ locationId: 1 })
      .lean() as any;
  }

  // ── Resolve the policy that applies to a specific location, falling
  // back to the tenant default. Returns null when neither exists —
  // callers (EmployeeOvertimeService) must treat that as "overtime is
  // not calculated for this employee," per the PO's Oct 2026 note. ──

  async getPolicyForLocation(
    tenantId: string,
    locationId: string | null,
  ): Promise<OvertimePolicyDocument | null> {
    const tId = new Types.ObjectId(tenantId);

    if (locationId) {
      const specific = await this.policyModel.findOne({
        tenantId: tId,
        locationId: new Types.ObjectId(locationId),
      });
      if (specific) return specific;
    }

    return this.policyModel.findOne({ tenantId: tId, locationId: null });
  }

  async getUncoveredLocations(
    tenantId: string,
    allLocationIds: string[],
  ): Promise<string[]> {
    const covered = await this.policyModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        locationId: { $ne: null },
      })
      .select('locationId')
      .lean();
    const coveredSet = new Set(
      covered.map((p: any) => p.locationId.toString()),
    );
    return allLocationIds.filter((id) => !coveredSet.has(id));
  }

  // Ascending by upToHours, with exactly one open-ended (null) tier
  // which must come last — the shape a progressive bracket calc needs.
  private normalizeTiers(
    tiers: UpsertOvertimePolicyDto['tiers'],
  ): OvertimePolicyTier[] {
    if (!tiers?.length) {
      throw new BadRequestException(
        'At least one overtime rate tier is required.',
      );
    }
    const sorted = [...tiers].sort((a, b) => {
      const av = a.upToHours;
      const bv = b.upToHours;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av - bv;
    });
    const openEnded = sorted.filter((t) => t.upToHours == null);
    if (openEnded.length !== 1 || sorted[sorted.length - 1].upToHours != null) {
      throw new BadRequestException(
        'Exactly one tier — the last one — must have no "up to hours" cap, so it covers every hour beyond the earlier tiers.',
      );
    }
    return sorted.map((t) => ({
      upToHours: t.upToHours ?? null,
      multiplier: t.multiplier,
    }));
  }

  // ── TENANT — create or update a policy for a location (or default) ──

  async upsertPolicy(
    tenantId: string,
    dto: UpsertOvertimePolicyDto,
  ): Promise<OvertimePolicyDocument> {
    const tId = new Types.ObjectId(tenantId);
    const locationId = dto.locationId
      ? new Types.ObjectId(dto.locationId)
      : null;
    const tiers = this.normalizeTiers(dto.tiers);

    return this.policyModel.findOneAndUpdate(
      { tenantId: tId, locationId },
      {
        tenantId: tId,
        locationId,
        name: dto.name ?? '',
        standardWeeklyHours: dto.standardWeeklyHours,
        tiers,
      },
      { upsert: true, new: true },
    );
  }

  async deletePolicy(tenantId: string, policyId: string): Promise<void> {
    const deleted = await this.policyModel.findOneAndDelete({
      _id: policyId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Overtime policy not found');
  }
}
