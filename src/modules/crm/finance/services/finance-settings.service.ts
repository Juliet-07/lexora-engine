import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as sharp from 'sharp';
import { User, UserDocument } from '../../../auth/schemas/user.schema';
import {
  PayslipTemplate,
  PayslipTemplateDocument,
} from '../../../hr/schemas/payroll.schema';
import {
  FinanceSettings,
  FinanceSettingsDocument,
  FinanceSettingsLog,
  FinanceSettingsLogDocument,
  SETTINGS_SECTIONS,
  SettingsSection,
} from '../schemas/finance-settings.schema';
import {
  BODY_FONTS,
  BRANDING_PRESETS,
  HEADING_FONTS,
} from '../../../../common/utils/pdf/branding.util';
import {
  PAYMENT_TERM_DAYS,
  defaultsFor,
  describeChanges,
  isSection,
  mergeWithDefaults,
  sanitizeSection,
} from './finance-settings.logic';
import { DocumentBrandingService } from './document-branding.service';
import { ExchangeRateService } from '../../../hr/services/exchange-rate.service';
import { GlEntry, GlEntryDocument } from '../schemas/accounting.schema';
import { Budget, BudgetDocument } from '../schemas/budget.schema';

export interface SettingsActor {
  id: string;
  name: string;
}

const toFileUrl = (filePath: string): string => {
  const raw = filePath.replace(/\\/g, '/');
  const i = raw.indexOf('uploads/');
  return `${process.env.APP_URL}/${i !== -1 ? raw.slice(i) : raw}`;
};
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
const MAX_LOG_LINES = 8;

@Injectable()
export class FinanceSettingsService {
  constructor(
    @InjectModel(FinanceSettings.name)
    private readonly model: Model<FinanceSettingsDocument>,
    @InjectModel(FinanceSettingsLog.name)
    private readonly logModel: Model<FinanceSettingsLogDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(PayslipTemplate.name)
    private readonly payslipModel: Model<PayslipTemplateDocument>,
    private readonly branding: DocumentBrandingService,
    @InjectModel(GlEntry.name)
    private readonly glModel: Model<GlEntryDocument>,
    @InjectModel(Budget.name)
    private readonly budgetModel: Model<BudgetDocument>,
    private readonly exchangeRates: ExchangeRateService,
  ) {}

  private tid(tenantId: string) {
    return new Types.ObjectId(tenantId);
  }

  private async getDoc(tenantId: string) {
    return (
      (await this.model.findOne({ tenantId: this.tid(tenantId) })) ??
      new this.model({ tenantId: this.tid(tenantId) })
    );
  }

  // One section, merged over the defaults — for the services that read a
  // setting (invoicing defaults, tax reminders, …).
  async getSection(tenantId: string, section: SettingsSection) {
    const doc: any = await this.model
      .findOne({ tenantId: this.tid(tenantId) })
      .lean();
    return mergeWithDefaults(section, doc?.[section]);
  }

  // Days to add to the issue date for the tenant's default terms.
  async defaultTermsDays(tenantId: string): Promise<number> {
    const inv = await this.getSection(tenantId, 'invoicing');
    return PAYMENT_TERM_DAYS[inv.defaultPaymentTerms] ?? 30;
  }

  async getBranding(tenantId: string) {
    return this.branding.resolve(tenantId);
  }

  // What the settings screen shows. For a tenant that has never saved
  // branding, the form is pre-filled with what their documents already
  // use (the old payslip branding, then the tenant profile), so the page
  // describes reality instead of an empty form.
  async getAll(tenantId: string) {
    const tid = this.tid(tenantId);
    const [doc, tenant, legacy] = await Promise.all([
      this.model.findOne({ tenantId: tid }).lean(),
      this.userModel.findById(tid).lean(),
      this.payslipModel.findOne({ tenantId: tid }).lean(),
    ]);
    const profile: any = (tenant as any)?.tenantProfile ?? {};
    const settings: Record<string, any> = {};
    for (const s of SETTINGS_SECTIONS) {
      settings[s] = mergeWithDefaults(s, (doc as any)?.[s]);
    }
    const storedBranding = (doc as any)?.branding ?? {};
    const b = settings.branding;
    if (!storedBranding.companyName)
      b.companyName = legacy?.companyName || profile?.businessName || '';
    if (!storedBranding.address && legacy?.companyAddress)
      b.address = legacy.companyAddress;
    if (
      !storedBranding.headerColor &&
      legacy?.accentColor &&
      legacy.accentColor.toLowerCase() !== '#6366f1'
    )
      b.headerColor = legacy.accentColor;
    if (!settings.tax.tin && profile?.taxId) settings.tax.tin = profile.taxId;

    const stored: any = (doc as any)?.logo;
    const fallbackLogo =
      (legacy?.logoUrl &&
        legacy.logoUrl.startsWith('data:') &&
        legacy.logoUrl) ||
      (profile?.logoUrl &&
        String(profile.logoUrl).startsWith('data:') &&
        profile.logoUrl) ||
      null;
    const logo = stored
      ? { url: stored.url, name: stored.name, source: 'finance' }
      : fallbackLogo
        ? {
            url: fallbackLogo,
            name: 'Current logo',
            source: legacy?.logoUrl ? 'payslip' : 'profile',
          }
        : null;

    return {
      settings,
      logo,
      profile: {
        businessName: profile?.businessName ?? '',
        taxId: profile?.taxId ?? '',
        baseCurrency: profile?.baseCurrency ?? 'USD',
        address: [
          profile?.address?.city,
          profile?.address?.state,
          profile?.address?.country,
        ]
          .filter(Boolean)
          .join(', '),
      },
      presets: BRANDING_PRESETS,
      fonts: { heading: HEADING_FONTS, body: BODY_FONTS },
    };
  }

  async updateSection(
    tenantId: string,
    section: string,
    patch: any,
    actor: SettingsActor,
  ) {
    if (!isSection(section))
      throw new BadRequestException(`Unknown settings section "${section}".`);
    const doc = await this.getDoc(tenantId);
    const before = mergeWithDefaults(section, (doc as any)[section]);
    const after = sanitizeSection(section, (doc as any)[section], patch);
    const lines = describeChanges(before, after);
    (doc as any)[section] = after;
    doc.markModified(section);
    await doc.save();
    await this.logLines(tenantId, section, lines, actor);
    return this.getAll(tenantId);
  }

  // ── Base currency ───────────────────────────────────────────
  //
  // The one currency the account's books are kept and reported in. It is
  // changed here (and only here), by the account owner.
  //
  // The general ledger stores every line in the base currency, next to the
  // line's own original currency and amounts, and budgets are entered in the
  // base currency. So changing it restates both into the new currency —
  // ledger lines from their preserved original amounts, budgets from the old
  // currency — at today's rates, so the books are never left half in one
  // currency and half in another. Every rate is fetched before anything is
  // written, so a missing rate stops the change with nothing touched; and
  // because the restatement is worked out from the original amounts, running
  // it again after an interruption simply finishes the job.
  async setBaseCurrency(tenantId: string, code: string, actor: SettingsActor) {
    const next = String(code ?? '')
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{3}$/.test(next))
      throw new BadRequestException(
        'Choose a valid 3-letter currency code, for example USD or RWF.',
      );
    const tid = this.tid(tenantId);
    const tenant: any = await this.userModel
      .findById(tid)
      .select('tenantProfile.baseCurrency')
      .lean();
    if (!tenant) throw new NotFoundException('Account not found.');
    const current = String(
      tenant.tenantProfile?.baseCurrency || 'USD',
    ).toUpperCase();
    if (next === current) return this.getAll(tenantId);

    // Every rate needed, up front.
    const ledgerCurrencies: string[] = await this.glModel.distinct(
      'originalCurrency',
      { tenantId: tid },
    );
    const rate: Record<string, number> = {};
    try {
      for (const c of new Set([...ledgerCurrencies, current]))
        rate[c.toUpperCase()] = (
          await this.exchangeRates.getRate(c, next)
        ).rate;
    } catch (e: any) {
      throw new BadGatewayException(
        `The exchange rate needed to move your books to ${next} could not be fetched, so nothing was changed. ${e?.message ?? ''}`.trim(),
      );
    }
    const money = (n: number) => Math.round(n * 100) / 100;

    // Ledger: recompute each line from the amounts it was originally
    // recorded in. A line recorded before original amounts were kept is
    // taken to be in the old base currency.
    let restated = 0;
    let ops: any[] = [];
    const flush = async () => {
      if (!ops.length) return;
      await this.glModel.bulkWrite(ops, { ordered: false });
      restated += ops.length;
      ops = [];
    };
    for await (const l of this.glModel
      .find({ tenantId: tid })
      .lean()
      .cursor()) {
      const hasOriginal = !!(l.originalDebit || l.originalCredit);
      const cur = (
        hasOriginal ? l.originalCurrency || current : current
      ).toUpperCase();
      const oDebit = hasOriginal ? l.originalDebit : l.debit;
      const oCredit = hasOriginal ? l.originalCredit : l.credit;
      const r = rate[cur] ?? (await this.exchangeRates.getRate(cur, next)).rate;
      ops.push({
        updateOne: {
          filter: { _id: l._id },
          update: {
            $set: {
              originalCurrency: cur,
              originalDebit: oDebit,
              originalCredit: oCredit,
              debit: money(oDebit * r),
              credit: money(oCredit * r),
              fxRateToBase: r,
            },
          },
        },
      });
      if (ops.length >= 500) await flush();
    }
    await flush();

    // Budgets are entered in the base currency.
    const factor = rate[current];
    const budgets = await this.budgetModel.find({ tenantId: tid }).lean();
    if (budgets.length)
      await this.budgetModel.bulkWrite(
        budgets.map((b: any) => ({
          updateOne: {
            filter: { _id: b._id },
            update: {
              $set: {
                lines: (b.lines ?? []).map((ln: any) => ({
                  ...ln,
                  budgetedAmount: money((ln.budgetedAmount ?? 0) * factor),
                })),
              },
            },
          },
        })),
      );

    const saved = await this.userModel.updateOne(
      { _id: tid },
      { $set: { 'tenantProfile.baseCurrency': next } },
    );
    if (!saved.matchedCount) throw new NotFoundException('Account not found.');

    await this.logEvent(
      tenantId,
      'general',
      `changed the base currency from ${current} to ${next}` +
        (restated || budgets.length
          ? ` (restated ${restated} ledger line${restated === 1 ? '' : 's'} and ${budgets.length} budget${budgets.length === 1 ? '' : 's'} at today's rates)`
          : ''),
      actor,
    );
    return this.getAll(tenantId);
  }

  async resetSection(tenantId: string, section: string, actor: SettingsActor) {
    if (!isSection(section))
      throw new BadRequestException(`Unknown settings section "${section}".`);
    const doc = await this.getDoc(tenantId);
    const before = mergeWithDefaults(section, (doc as any)[section]);
    const after = defaultsFor(section);
    // Resetting the look of documents does not wipe who the company is.
    if (section === 'branding') {
      for (const k of ['companyName', 'tagline', 'address'])
        after[k] = before[k];
    }
    (doc as any)[section] = after;
    doc.markModified(section);
    await doc.save();
    await this.logEvent(
      tenantId,
      section,
      `reset ${section} settings to defaults`,
      actor,
    );
    return this.getAll(tenantId);
  }

  // ── Logo ────────────────────────────────────────────────────

  async setLogo(
    tenantId: string,
    file: Express.Multer.File,
    actor: SettingsActor,
  ) {
    if (!file) throw new BadRequestException('Choose a logo file to upload.');
    if (!LOGO_TYPES.includes(file.mimetype))
      throw new BadRequestException(
        'The logo has to be an SVG, PNG or JPG file.',
      );
    let buf = file.buffer;
    let mime = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;
    try {
      if (mime === 'image/svg+xml') {
        // Documents are PDFs, which cannot draw SVG — keep it sharp as a PNG.
        buf = await sharp(buf, { density: 300 })
          .resize({ width: 900, withoutEnlargement: true })
          .png()
          .toBuffer();
        mime = 'image/png';
      } else {
        await sharp(buf).metadata();
      }
    } catch {
      throw new BadRequestException('That file could not be read as an image.');
    }
    const dir = path.join(
      process.cwd(),
      'uploads',
      'finance-branding',
      tenantId,
    );
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ext = mime === 'image/png' ? '.png' : '.jpg';
    const target = path.join(dir, `${uuidv4()}${ext}`);
    fs.writeFileSync(target, buf);

    const doc = await this.getDoc(tenantId);
    const old: any = (doc as any).logo;
    (doc as any).logo = {
      url: toFileUrl(target),
      path: target,
      name: file.originalname,
      mimeType: mime,
    };
    await doc.save();
    try {
      if (old?.path && fs.existsSync(old.path)) fs.unlinkSync(old.path);
    } catch {
      /* a stale file is not worth failing the upload */
    }
    await this.logEvent(
      tenantId,
      'branding',
      `uploaded a new logo (${file.originalname})`,
      actor,
    );
    return this.getAll(tenantId);
  }

  async removeLogo(tenantId: string, actor: SettingsActor) {
    const doc = await this.getDoc(tenantId);
    const old: any = (doc as any).logo;
    (doc as any).logo = null;
    await doc.save();
    try {
      if (old?.path && fs.existsSync(old.path)) fs.unlinkSync(old.path);
    } catch {
      /* ignore */
    }
    if (old)
      await this.logEvent(tenantId, 'branding', 'removed the logo', actor);
    return this.getAll(tenantId);
  }

  // ── Change log ──────────────────────────────────────────────

  async logEvent(
    tenantId: string,
    section: string,
    summary: string,
    actor: SettingsActor,
  ) {
    await this.logModel.create({
      tenantId: this.tid(tenantId),
      section,
      summary,
      actorId: actor.id,
      actorName: actor.name,
    });
  }

  private async logLines(
    tenantId: string,
    section: string,
    lines: string[],
    actor: SettingsActor,
  ) {
    if (!lines.length) return;
    const shown = lines.slice(0, MAX_LOG_LINES);
    for (const l of shown) await this.logEvent(tenantId, section, l, actor);
    if (lines.length > shown.length)
      await this.logEvent(
        tenantId,
        section,
        `made ${lines.length - shown.length} more changes`,
        actor,
      );
  }

  async getLog(tenantId: string, section?: string) {
    const q: any = { tenantId: this.tid(tenantId) };
    if (section && section !== 'all') q.section = section;
    return this.logModel.find(q).sort({ createdAt: -1 }).limit(200).lean();
  }
}
