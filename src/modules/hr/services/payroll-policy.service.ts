import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PayrollPolicy,
  PayrollPolicyDocument,
  PayrollDeductionRule,
} from '../schemas/';
import {
  RWANDA_DEDUCTION_PRESET,
  RWANDA_ALLOWANCE_PRESET,
} from '../rwanda-preset';
import { UpsertPayrollPolicyDto } from '../dtos';

@Injectable()
export class PayrollPolicyService {
  constructor(
    @InjectModel(PayrollPolicy.name)
    private readonly policyModel: Model<PayrollPolicyDocument>,
  ) {}

  // ── TENANT — list all policies (one per location + maybe a default) ──

  async getAllPolicies(tenantId: string): Promise<PayrollPolicyDocument[]> {
    return this.policyModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .populate('locationId', 'name country city')
      .sort({ locationId: 1 })
      .lean() as any;
  }

  // ── TENANT — get the policy that applies to a specific location,
  // falling back to the tenant default if no location-specific
  // policy exists. Mirrors the existing LeavePolicy fallback chain. ──

  async getPolicyForLocation(
    tenantId: string,
    locationId: string | null,
  ): Promise<PayrollPolicyDocument | null> {
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

  // ── TENANT — create or update a policy for a location (or default) ──

  async upsertPolicy(
    tenantId: string,
    dto: UpsertPayrollPolicyDto,
  ): Promise<PayrollPolicyDocument> {
    const tId = new Types.ObjectId(tenantId);
    const locationId = dto.locationId
      ? new Types.ObjectId(dto.locationId)
      : null;

    return this.policyModel.findOneAndUpdate(
      { tenantId: tId, locationId },
      {
        tenantId: tId,
        locationId,
        currency: dto.currency,
        payFrequency: dto.payFrequency ?? 'monthly',
        allowanceTypes: dto.allowanceTypes ?? [],
        deductions: dto.deductions ?? [],
        effectiveFrom: dto.effectiveFrom
          ? new Date(dto.effectiveFrom)
          : new Date(),
      },
      { upsert: true, new: true },
    );
  }

  // ── TENANT — apply the built-in Rwanda statutory preset to a
  // location (or tenant default). Creates the policy if it doesn't
  // exist yet, or REPLACES only the statutory-preset deduction lines
  // on an existing policy (preserving any custom non-preset
  // deductions the tenant already added, like a custom loan-adjacent
  // line item) unless `overwrite` is explicitly true. ──

  async applyRwandaPreset(
    tenantId: string,
    locationId: string | null,
    overwrite = false,
  ): Promise<PayrollPolicyDocument> {
    const tId = new Types.ObjectId(tenantId);
    const locId = locationId ? new Types.ObjectId(locationId) : null;

    const existing = await this.policyModel.findOne({
      tenantId: tId,
      locationId: locId,
    });

    if (!existing) {
      return this.policyModel.create({
        tenantId: tId,
        locationId: locId,
        currency: 'RWF',
        payFrequency: 'monthly',
        allowanceTypes: RWANDA_ALLOWANCE_PRESET,
        deductions: RWANDA_DEDUCTION_PRESET,
        effectiveFrom: new Date(),
      });
    }

    const nonPresetDeductions: PayrollDeductionRule[] = overwrite
      ? []
      : existing.deductions.filter((d) => !d.isStatutoryPreset);

    existing.deductions = [...RWANDA_DEDUCTION_PRESET, ...nonPresetDeductions];
    if (overwrite) {
      existing.allowanceTypes = RWANDA_ALLOWANCE_PRESET;
      existing.currency = 'RWF';
    }
    await existing.save();
    return existing;
  }

  async deletePolicy(tenantId: string, policyId: string): Promise<void> {
    const deleted = await this.policyModel.findOneAndDelete({
      _id: policyId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Payroll policy not found');
  }
}
