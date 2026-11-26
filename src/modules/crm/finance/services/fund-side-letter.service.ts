import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CapitalCommitment,
  CapitalCommitmentDocument,
  SideLetter,
  SideLetterDocument,
  SideLetterStatus,
  SideLetterMfn,
  ProvisionCompliance,
  MfnElectionStatus,
} from '../schemas';
import {
  CreateSideLetterDto,
  UpdateSideLetterDto,
  SetProvisionComplianceDto,
  RecordMfnElectionDto,
} from '../dtos';
import { fileRecord, UploadedFundFile } from './fund-document.service';

// The provision types offered in the form. Anything else is accepted too
// (a side letter can say anything), these are the common ones.
export const SIDE_LETTER_PROVISION_TYPES = [
  'Management fee reduction',
  'Carried interest adjustment',
  'Co-investment rights',
  'LPAC seat guarantee',
  'Reporting frequency',
  'Excuse rights',
  'Key person provisions',
  'Transfer rights',
  'Tax structuring',
  'Information rights',
  'Other',
];

const isFeeProvision = (type: string) => /management fee/i.test(type);
const isLpacProvision = (type: string) => /lpac|advisory committee/i.test(type);

@Injectable()
export class FundSideLetterService {
  constructor(
    @InjectModel(SideLetter.name)
    private readonly model: Model<SideLetterDocument>,
    @InjectModel(CapitalCommitment.name)
    private readonly commitmentModel: Model<CapitalCommitmentDocument>,
  ) {}

  private scope(tenantId: string, fundId: string) {
    return {
      tenantId: new Types.ObjectId(tenantId),
      fundId: new Types.ObjectId(fundId),
    };
  }

  private async nextRef(tenantId: string, fundId: string) {
    const all = await this.model
      .find(this.scope(tenantId, fundId))
      .select('ref')
      .lean();
    const max = all.reduce(
      (m, s) => Math.max(m, parseInt(s.ref.replace(/\D/g, ''), 10) || 0),
      0,
    );
    return `SL-${String(max + 1).padStart(3, '0')}`;
  }

  private async commitment(tenantId: string, fundId: string, id: string) {
    const c = await this.commitmentModel
      .findOne({ _id: id, ...this.scope(tenantId, fundId) })
      .exec();
    if (!c) throw new BadRequestException('That LP is not in this fund');
    return c;
  }

  async list(tenantId: string, fundId: string) {
    const letters = await this.model
      .find(this.scope(tenantId, fundId))
      .sort({ createdAt: 1 })
      .lean();
    const commitments = await this.commitmentModel
      .find(this.scope(tenantId, fundId))
      .lean();
    const byId = new Map(commitments.map((c) => [String(c._id), c]));
    const rows = letters.map((l) => ({
      ...l,
      commitment: byId.get(String(l.commitmentId))?.commitment ?? 0,
      lpType: byId.get(String(l.commitmentId))?.type ?? '',
    }));

    const executed = rows.filter((l) => l.status === SideLetterStatus.EXECUTED);
    const openMfn = executed.flatMap((l) =>
      l.mfnFlags.flatMap((f) =>
        f.elections
          .filter((e) => e.status === MfnElectionStatus.PENDING)
          .map(() => 1),
      ),
    );
    const breaches = rows.flatMap((l) =>
      l.provisions.filter((p) => p.compliance === ProvisionCompliance.BREACH),
    );
    const lpacMembers = executed.flatMap((l) =>
      l.provisions
        .filter((p) => isLpacProvision(p.type))
        .map(() => ({
          commitmentId: l.commitmentId,
          lpName: l.lpName,
          commitment: byId.get(String(l.commitmentId))?.commitment ?? 0,
          sideLetterRef: l.ref,
        })),
    );
    return {
      letters: rows,
      provisionTypes: SIDE_LETTER_PROVISION_TYPES,
      stats: {
        total: rows.length,
        executed: executed.length,
        draft: rows.length - executed.length,
        mfnOpen: openMfn.length,
        breaches: breaches.length,
        lpacMembers: lpacMembers.length,
      },
      lpac: lpacMembers,
    };
  }

  async getOne(tenantId: string, fundId: string, id: string) {
    const l = await this.model
      .findOne({ _id: id, ...this.scope(tenantId, fundId) })
      .lean();
    if (!l) throw new NotFoundException('Side letter not found');
    return l;
  }

  private mapProvisions(
    items: {
      type: string;
      lpaDefault?: string;
      term: string;
      mfn?: SideLetterMfn;
      notes?: string;
      feePct?: number;
    }[],
  ) {
    if (!items.length)
      throw new BadRequestException('Add at least one provision');
    return items.map((p) => {
      if (isFeeProvision(p.type) && (p.feePct == null || p.feePct < 0))
        throw new BadRequestException(
          'A management fee reduction needs the rate it sets (in percent)',
        );
      return {
        type: p.type.trim(),
        lpaDefault: p.lpaDefault ?? '',
        term: p.term.trim(),
        mfn: p.mfn ?? SideLetterMfn.NOT_APPLICABLE,
        notes: p.notes ?? '',
        feePct: isFeeProvision(p.type) ? (p.feePct ?? null) : null,
        compliance: ProvisionCompliance.PENDING,
      };
    });
  }

  async create(
    tenantId: string,
    fundId: string,
    dto: CreateSideLetterDto,
    file?: UploadedFundFile,
  ) {
    const c = await this.commitment(tenantId, fundId, dto.commitmentId);
    const created = await this.model.create({
      ...this.scope(tenantId, fundId),
      ref: await this.nextRef(tenantId, fundId),
      commitmentId: c._id,
      lpName: c.lpName,
      effectiveDate: new Date(dto.effectiveDate),
      status:
        dto.status === SideLetterStatus.EXECUTED
          ? SideLetterStatus.DRAFT
          : (dto.status ?? SideLetterStatus.DRAFT),
      mfnElectionDeadline: dto.mfnElectionDeadline
        ? new Date(dto.mfnElectionDeadline)
        : null,
      provisions: this.mapProvisions(dto.provisions),
      document: file ? fileRecord(file, 'fund-side-letters', tenantId) : null,
    });
    // Executing is its own step so the fee override and MFN flags are
    // only ever applied once, by one code path.
    if (dto.status === SideLetterStatus.EXECUTED)
      return this.execute(tenantId, fundId, String(created._id));
    return created.toObject();
  }

  async update(
    tenantId: string,
    fundId: string,
    id: string,
    dto: UpdateSideLetterDto,
  ) {
    const l = await this.model.findOne({
      _id: id,
      ...this.scope(tenantId, fundId),
    });
    if (!l) throw new NotFoundException('Side letter not found');
    if (l.status === SideLetterStatus.EXECUTED)
      throw new BadRequestException(
        'An executed side letter cannot be edited — record an amendment as a new side letter',
      );
    if (dto.effectiveDate) l.effectiveDate = new Date(dto.effectiveDate);
    if (dto.mfnElectionDeadline)
      l.mfnElectionDeadline = new Date(dto.mfnElectionDeadline);
    if (dto.provisions)
      l.provisions = this.mapProvisions(dto.provisions) as any;
    if (dto.status && dto.status !== SideLetterStatus.EXECUTED)
      l.status = dto.status;
    await l.save();
    if (dto.status === SideLetterStatus.EXECUTED)
      return this.execute(tenantId, fundId, id);
    return l.toObject();
  }

  /**
   * Executing a side letter makes it binding: a fee provision sets the LP's
   * fee rate for every fee charged from then on, and each MFN-triggering
   * provision opens an election window for the other LPs entitled to it.
   */
  async execute(tenantId: string, fundId: string, id: string) {
    const l = await this.model.findOne({
      _id: id,
      ...this.scope(tenantId, fundId),
    });
    if (!l) throw new NotFoundException('Side letter not found');
    if (l.status === SideLetterStatus.EXECUTED) return l.toObject();

    const c = await this.commitment(tenantId, fundId, String(l.commitmentId));
    const deadline =
      l.mfnElectionDeadline ?? new Date(Date.now() + 30 * 86400000);

    const others = await this.commitmentModel
      .find({
        ...this.scope(tenantId, fundId),
        _id: { $ne: c._id },
        isGpCommitment: { $ne: true },
        commitment: { $gte: c.commitment },
      })
      .lean();

    for (const p of l.provisions) {
      if (p.mfn === SideLetterMfn.TRIGGERED) {
        l.mfnFlags.push({
          provisionType: p.type,
          term: p.term,
          electionDeadline: deadline,
          elections: others.map((o) => ({
            commitmentId: o._id,
            lpName: o.lpName,
            status: MfnElectionStatus.PENDING,
            respondedAt: null,
          })),
        } as any);
      }
    }

    const fees = l.provisions
      .filter((p) => isFeeProvision(p.type) && p.feePct != null)
      .map((p) => p.feePct as number);
    if (fees.length) c.mgmtFeePctOverride = Math.min(...fees);
    c.hasSideLetter = true;
    await c.save();

    l.status = SideLetterStatus.EXECUTED;
    l.executedAt = new Date();
    if (!l.mfnElectionDeadline) l.mfnElectionDeadline = deadline;
    await l.save();
    return l.toObject();
  }

  async setCompliance(
    tenantId: string,
    fundId: string,
    id: string,
    provisionId: string,
    dto: SetProvisionComplianceDto,
  ) {
    const l = await this.model.findOne({
      _id: id,
      ...this.scope(tenantId, fundId),
    });
    if (!l) throw new NotFoundException('Side letter not found');
    if (l.status !== SideLetterStatus.EXECUTED)
      throw new BadRequestException(
        'Compliance is tracked once the side letter is executed',
      );
    const p: any = l.provisions.id(provisionId);
    if (!p) throw new NotFoundException('Provision not found');
    p.compliance = dto.compliance;
    p.complianceNotes = dto.notes ?? p.complianceNotes;
    p.complianceCheckedAt = new Date();
    await l.save();
    return l.toObject();
  }

  /** An LP answers an MFN offer. Electing a fee term gives them that rate. */
  async recordElection(
    tenantId: string,
    fundId: string,
    id: string,
    flagId: string,
    commitmentId: string,
    dto: RecordMfnElectionDto,
  ) {
    if (dto.status === MfnElectionStatus.PENDING)
      throw new BadRequestException('Choose elected or declined');
    const l = await this.model.findOne({
      _id: id,
      ...this.scope(tenantId, fundId),
    });
    if (!l) throw new NotFoundException('Side letter not found');
    const flag: any = l.mfnFlags.id(flagId);
    if (!flag) throw new NotFoundException('MFN offer not found');
    const e = flag.elections.find(
      (x: any) => String(x.commitmentId) === commitmentId,
    );
    if (!e)
      throw new NotFoundException('That LP is not entitled to this election');
    if (e.status !== MfnElectionStatus.PENDING)
      throw new BadRequestException('This election has already been recorded');
    if (
      dto.status === MfnElectionStatus.ELECTED &&
      flag.electionDeadline &&
      new Date(flag.electionDeadline) < new Date()
    )
      throw new BadRequestException(
        'The election window for this term has closed',
      );
    e.status = dto.status;
    e.respondedAt = new Date();

    if (
      dto.status === MfnElectionStatus.ELECTED &&
      isFeeProvision(flag.provisionType)
    ) {
      const src = l.provisions.find(
        (p) => p.type === flag.provisionType && p.term === flag.term,
      );
      if (src?.feePct != null) {
        const c = await this.commitment(tenantId, fundId, commitmentId);
        c.mgmtFeePctOverride =
          c.mgmtFeePctOverride == null
            ? src.feePct
            : Math.min(c.mgmtFeePctOverride, src.feePct);
        c.hasSideLetter = true;
        await c.save();
      }
    }
    await l.save();
    return l.toObject();
  }

  async attachDocument(
    tenantId: string,
    fundId: string,
    id: string,
    file: UploadedFundFile | undefined,
  ) {
    if (!file) throw new BadRequestException('Attach the side letter file');
    const l = await this.model.findOne({
      _id: id,
      ...this.scope(tenantId, fundId),
    });
    if (!l) throw new NotFoundException('Side letter not found');
    l.document = fileRecord(file, 'fund-side-letters', tenantId);
    await l.save();
    return l.toObject();
  }

  async remove(tenantId: string, fundId: string, id: string) {
    const l = await this.model.findOne({
      _id: id,
      ...this.scope(tenantId, fundId),
    });
    if (!l) throw new NotFoundException('Side letter not found');
    if (l.status === SideLetterStatus.EXECUTED)
      throw new BadRequestException(
        'An executed side letter cannot be deleted',
      );
    await l.deleteOne();
    return { deleted: true };
  }
}
