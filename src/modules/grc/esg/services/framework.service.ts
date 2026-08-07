import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EsgFramework,
  EsgFrameworkDocument,
  STANDARD_FRAMEWORKS,
  ReportIndicator,
  ReportIndicatorDocument,
  IndicatorStatus,
  EsgReport,
  EsgReportDocument,
  EsgReportStatus,
} from '../schemas';
import {
  CreateFrameworkDto,
  UpdateFrameworkDto,
  SetFrameworkActiveDto,
  ReorderFrameworksDto,
  CreateIndicatorDto,
  UpdateIndicatorResponseDto,
  CompileReportDto,
} from '../dtos';
import { frameworkCoverage } from 'src/common/utils/esg-calculations.util';

const slugify = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '');

@Injectable()
export class EsgFrameworkService {
  constructor(
    @InjectModel(EsgFramework.name)
    private readonly frameworkModel: Model<EsgFrameworkDocument>,
    @InjectModel(ReportIndicator.name)
    private readonly indicatorModel: Model<ReportIndicatorDocument>,
    @InjectModel(EsgReport.name)
    private readonly reportModel: Model<EsgReportDocument>,
  ) {}

  // ── Frameworks — seed once, then fully tenant-owned ─────────

  // Seeds the 6 standard frameworks the first time a tenant touches
  // Reporting. Matches on `key`, so it's safe to call on every
  // getAll() — a tenant who has already renamed, deactivated or
  // deleted one of these never gets it silently recreated, because
  // deletion removes the row (see `remove` below) but re-seeding
  // only fires for keys that are entirely absent from day one.
  private async ensureSeeded(tenantId: string): Promise<void> {
    const tId = new Types.ObjectId(tenantId);
    const existing = await this.frameworkModel
      .find({ tenantId: tId })
      .select('key')
      .lean();
    if (existing.length > 0) return; // already seeded at least once — never re-seed
    await this.frameworkModel.insertMany(
      STANDARD_FRAMEWORKS.map((f, i) => ({
        tenantId: tId,
        key: f.key,
        label: f.label,
        description: f.description,
        isStandard: true,
        isActive: true,
        order: i,
      })),
    );
  }

  async getAllFrameworks(tenantId: string, includeInactive = true) {
    await this.ensureSeeded(tenantId);
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (!includeInactive) query.isActive = true;
    return this.frameworkModel.find(query).sort({ order: 1, label: 1 }).lean();
  }

  private async getRawFramework(tenantId: string, id: string) {
    const f = await this.frameworkModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!f) throw new NotFoundException('Framework not found');
    return f;
  }

  // A wholly custom framework — for licensing-tied requirements that
  // don't fit a generic international standard (e.g. a Capital
  // Markets Authority corporate governance code, or a central bank's
  // licensing conditions). isStandard stays false, so it's never
  // touched by re-seeding logic and behaves identically to the
  // built-in six from here on.
  async createFramework(tenantId: string, dto: CreateFrameworkDto) {
    const tId = new Types.ObjectId(tenantId);
    const count = await this.frameworkModel.countDocuments({ tenantId: tId });
    let key = slugify(dto.label) || `CUSTOM_${Date.now()}`;
    // Guard against a custom label colliding with an existing key
    // (including a standard one, if the tenant named it that).
    let suffix = 0;
    while (
      await this.frameworkModel.exists({
        tenantId: tId,
        key: `${key}${suffix ? `_${suffix}` : ''}`,
      })
    ) {
      suffix += 1;
    }
    if (suffix) key = `${key}_${suffix}`;

    const created = await this.frameworkModel.create({
      tenantId: tId,
      key,
      label: dto.label,
      description: dto.description ?? '',
      isStandard: false,
      isActive: true,
      order: count,
    });
    return created.toObject();
  }

  async updateFramework(tenantId: string, id: string, dto: UpdateFrameworkDto) {
    const f = await this.getRawFramework(tenantId, id);
    if (dto.label !== undefined) f.label = dto.label;
    if (dto.description !== undefined) f.description = dto.description;
    await f.save();
    return f.toObject();
  }

  // Hides the tab without touching any of its indicators or reports
  // — reversible, and the safer default for "we don't use this one".
  async setActive(tenantId: string, id: string, dto: SetFrameworkActiveDto) {
    const f = await this.getRawFramework(tenantId, id);
    f.isActive = dto.isActive;
    await f.save();
    return f.toObject();
  }

  async reorder(tenantId: string, dto: ReorderFrameworksDto) {
    const tId = new Types.ObjectId(tenantId);
    await Promise.all(
      dto.frameworkIds.map((id, order) =>
        this.frameworkModel.updateOne(
          { _id: id, tenantId: tId },
          { $set: { order } },
        ),
      ),
    );
    return this.getAllFrameworks(tenantId);
  }

  // Permanently removes a framework the tenant genuinely never wants
  // back — including a standard one. Its indicators go with it;
  // compiled reports referencing it are left as historical record.
  // deactivate (setActive false) is the reversible alternative and
  // should be the one the frontend defaults to.
  async deleteFramework(tenantId: string, id: string) {
    const tId = new Types.ObjectId(tenantId);
    await this.getRawFramework(tenantId, id); // 404s if not found/not owned
    await Promise.all([
      this.frameworkModel.deleteOne({ _id: id, tenantId: tId }),
      this.indicatorModel.deleteMany({ frameworkId: id, tenantId: tId }),
    ]);
    return { deleted: true };
  }

  // ── Indicators ───────────────────────────────────────────────

  async getIndicators(tenantId: string, frameworkId: string) {
    return this.indicatorModel
      .find({ tenantId: new Types.ObjectId(tenantId), frameworkId })
      .sort({ code: 1 })
      .lean();
  }

  async coverageFor(tenantId: string, frameworkId: string) {
    const rows = await this.getIndicators(tenantId, frameworkId);
    return frameworkCoverage(rows);
  }

  async coverageForAll(tenantId: string) {
    const frameworks = await this.getAllFrameworks(tenantId, false);
    const out: Record<
      string,
      { signedOff: number; total: number; pct: number }
    > = {};
    for (const f of frameworks) {
      out[String(f._id)] = await this.coverageFor(tenantId, String(f._id));
    }
    return out;
  }

  async addIndicator(
    tenantId: string,
    frameworkId: string,
    dto: CreateIndicatorDto,
  ) {
    await this.getRawFramework(tenantId, frameworkId); // 404s if framework doesn't belong to tenant
    const created = await this.indicatorModel.create({
      tenantId: new Types.ObjectId(tenantId),
      frameworkId,
      code: dto.code,
      title: dto.title,
      owner: dto.owner ?? 'Unassigned',
      response: '',
      evidence: [],
      status: IndicatorStatus.NOT_STARTED,
      signedOffBy: null,
      signedOffAt: null,
    });
    return created.toObject();
  }

  private async getRawIndicator(tenantId: string, id: string) {
    const i = await this.indicatorModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!i) throw new NotFoundException('Indicator not found');
    return i;
  }

  async updateResponse(
    tenantId: string,
    id: string,
    dto: UpdateIndicatorResponseDto,
  ) {
    const i = await this.getRawIndicator(tenantId, id);
    i.response = dto.response;
    if (i.status === IndicatorStatus.NOT_STARTED) {
      i.status = IndicatorStatus.IN_PROGRESS;
    }
    await i.save();
    return i.toObject();
  }

  async addEvidence(
    tenantId: string,
    id: string,
    files: Express.Multer.File[],
  ) {
    const i = await this.getRawIndicator(tenantId, id);
    for (const file of files) {
      i.evidence.push({
        name: file.originalname,
        fileUrl: `/uploads/esg/indicators/${file.filename}`,
        mimeType: file.mimetype,
        size: file.size,
      } as any);
    }
    if (i.status === IndicatorStatus.NOT_STARTED) {
      i.status = IndicatorStatus.IN_PROGRESS;
    }
    await i.save();
    return i.toObject();
  }

  async submitForSignOff(tenantId: string, id: string) {
    const i = await this.getRawIndicator(tenantId, id);
    if (!i.response.trim()) {
      throw new BadRequestException('Add a response before submitting');
    }
    i.status = IndicatorStatus.AWAITING_SIGN_OFF;
    await i.save();
    return i.toObject();
  }

  async signOff(tenantId: string, id: string, signedOffBy: string) {
    const i = await this.getRawIndicator(tenantId, id);
    i.status = IndicatorStatus.SIGNED_OFF;
    i.signedOffBy = signedOffBy;
    i.signedOffAt = new Date();
    await i.save();
    return i.toObject();
  }

  // ── Reports ──────────────────────────────────────────────────

  async getReports(tenantId: string) {
    return this.reportModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async compile(tenantId: string, frameworkId: string, dto: CompileReportDto) {
    const framework = await this.getRawFramework(tenantId, frameworkId);
    const indicators = await this.getIndicators(tenantId, frameworkId);
    const pending = indicators.filter(
      (i) => i.status !== IndicatorStatus.SIGNED_OFF,
    );
    const period = dto.period ?? String(new Date().getFullYear());

    const created = await this.reportModel.create({
      tenantId: new Types.ObjectId(tenantId),
      frameworkId,
      title: `${framework.label} Report ${period}`,
      period,
      status: EsgReportStatus.COMPILED,
      compiledAt: new Date(),
      publishedAt: null,
      note: `Auto-assembled from ${indicators.length} indicators (${indicators.length - pending.length} signed off).`,
    });
    return {
      report: created.toObject(),
      pendingCount: pending.length,
    };
  }

  async publish(tenantId: string, id: string) {
    const r = await this.reportModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      { $set: { status: EsgReportStatus.PUBLISHED, publishedAt: new Date() } },
      { new: true },
    );
    if (!r) throw new NotFoundException('Report not found');
    return r.toObject();
  }
}
