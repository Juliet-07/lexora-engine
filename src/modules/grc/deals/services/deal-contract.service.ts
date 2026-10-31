import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Deal, DealDocument } from '../schemas';
import { GenerateDealContractDto } from '../dtos/deal-contract.dto';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import {
  PlatformContractTemplate,
  PlatformContractTemplateDocument,
  PlatformTemplateStatus,
} from 'src/modules/super_admin/schemas/contract-template.schema';
import {
  MERGE_FIELD_REGISTRY,
  getMergeFieldRegistry,
} from 'src/common/utils/contract-merge-registry';
import { formatBulletList } from 'src/common/utils/contract-fields.util';
import {
  buildCommonMergeFields,
  loadTenantCompany,
  nonEmpty,
  overlayNonEmpty,
  type TenantCompany,
} from 'src/common/utils/contract-common-fields';
import { splitTemplateIntoSections } from '../../../../common/utils/deal.contract.util';

// Templates a Super Admin publishes for deal contracts live under
// module "grc", area "deals".
export const DEAL_TEMPLATE_MODULE = 'grc';
export const DEAL_TEMPLATE_AREA = 'deals';

const isoDate = (d: Date | string | null | undefined): string =>
  d ? new Date(d).toISOString().slice(0, 10) : '';

const money = (n: number | null | undefined): string =>
  n == null ? '' : Number(n).toLocaleString('en-US');

@Injectable()
export class DealContractService {
  constructor(
    @InjectModel(Deal.name) private readonly dealModel: Model<DealDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(PlatformContractTemplate.name)
    private readonly templateModel: Model<PlatformContractTemplateDocument>,
  ) {}

  private async getDeal(tenantId: string, dealId: string) {
    if (!Types.ObjectId.isValid(dealId)) {
      throw new NotFoundException('Deal not found');
    }
    const deal = await this.dealModel.findOne({
      _id: dealId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  // Every token that only a deal contract has, valued from the deal. A
  // field the deal has nothing for is an empty string — it stays visible
  // as {{token}} in the document and in the Fields panel, so the tenant
  // sees the gap rather than a silently incomplete agreement.
  buildDealMergeFields(deal: any): Record<string, string> {
    const parties: any[] = deal.parties ?? [];
    const buyer = parties.find((p) => p.side === 'Buyer');
    const seller = parties.find((p) => p.side === 'Seller');
    const ts = deal.termSheet ?? {};
    const signing = deal.signing ?? {};
    const signatories: any[] = signing.signatories ?? [];
    return {
      dealName: deal.name ?? '',
      dealType: deal.type ?? '',
      dealStage: deal.stage ?? '',
      dealJurisdiction: deal.jurisdiction ?? '',
      dealValue: money(deal.value),
      dealCurrency: deal.currency ?? '',
      clientName: deal.client ?? '',
      dealCounterpartyName:
        deal.counterparty && deal.counterparty !== 'TBD'
          ? deal.counterparty
          : '',
      leadPartner:
        deal.leadPartner && deal.leadPartner !== 'Unassigned'
          ? deal.leadPartner
          : '',
      feeRate: deal.feeRate != null ? `${deal.feeRate}%` : '',
      dealStartDate: isoDate(deal.startDate),
      targetCloseDate: isoDate(deal.targetClose),
      longstopDate: isoDate(deal.longstopDate),
      buyerName: buyer?.name ?? '',
      buyerTitle: buyer?.title ?? '',
      buyerEmail: buyer?.email ?? '',
      sellerName: seller?.name ?? '',
      sellerTitle: seller?.title ?? '',
      sellerEmail: seller?.email ?? '',
      partiesList: formatBulletList(
        parties.map((p) =>
          [p.name, p.title ? `— ${p.title}` : '', `(${p.side})`]
            .filter(Boolean)
            .join(' '),
        ),
      ),
      termSheetStructure: ts.structure ?? '',
      termSheetConsideration: ts.consideration ?? '',
      termSheetConditions: ts.conditions ?? '',
      termSheetExclusivity: ts.exclusivity ?? '',
      termSheetConfidentiality: ts.confidentiality ?? '',
      termSheetTimeline: ts.timeline ?? '',
      signingDate: isoDate(signing.signingDate),
      signingVenue: signing.venue ?? '',
      signatoriesList: formatBulletList(
        signatories.map((s) =>
          [s.name, s.role ? `— ${s.role}` : '', s.party ? `(${s.party})` : '']
            .filter(Boolean)
            .join(' '),
        ),
      ),
    };
  }

  // The full value set for a contract in this deal: the common fields
  // (parties, our company, dates, value…) overlaid with the deal's own.
  buildAllFields(
    deal: any,
    tenant: TenantCompany,
    input: {
      title?: string;
      reference?: string;
      dto?: Partial<GenerateDealContractDto>;
    } = {},
  ): Record<string, string> {
    const dto = input.dto ?? {};
    return overlayNonEmpty(
      buildCommonMergeFields({
        tenant,
        title: input.title,
        reference: input.reference,
        // A deal contract is governed by the deal's jurisdiction unless
        // another is entered.
        governingLaw: dto.governingLaw || deal.jurisdiction,
        scopeOfWork: dto.scopeOfWork,
        partyA: dto.partyA,
        partyB: dto.partyB,
        effectiveDate: dto.effectiveDate,
        expiryDate: dto.expiresOn || isoDate(deal.longstopDate),
        value: dto.value ?? deal.value,
        currency: dto.currency ?? deal.currency ?? 'USD',
      }),
      this.buildDealMergeFields(deal),
    );
  }

  private slimTemplate(t: any) {
    return {
      _id: String(t._id),
      title: t.title,
      category: t.category,
      jurisdiction: t.jurisdiction ?? '',
      description: t.description ?? '',
      version: t.version ?? '1.0',
      folderId: t.folderId ? String(t.folderId) : null,
      updatedAt: t.updatedAt,
      // Included so the form can show which fields the template uses
      // and which of them this deal can fill — see describeTokens.
      content: t.content ?? '',
    };
  }

  // The published templates a deal can draw from.
  async listTemplates() {
    const templates = await this.templateModel
      .find({
        moduleKey: DEAL_TEMPLATE_MODULE,
        areaKey: DEAL_TEMPLATE_AREA,
        status: PlatformTemplateStatus.PUBLISHED,
      })
      .sort({ updatedAt: -1 })
      .lean();
    return templates.map((t) => this.slimTemplate(t));
  }

  // Every distinct {{token}} in a template, classified by where its value
  // will come from on a deal contract:
  //   deal    — read from the deal record or our company profile
  //   auto    — filled by the system (today's date, the reference)
  //   form    — typed on the generate form (title, Party B, …)
  //   clause  — a clause-level detail of the template, completed on the
  //             contract itself
  //   unknown — not in the field registry at all (a typo, or a custom
  //             token): it stays as literal {{token}} text
  // Whatever is still empty after generating can be filled in on the
  // contract's Fields tab.
  describeTokens(content: string, known: Record<string, string>) {
    const seen = new Set<string>();
    const out: {
      token: string;
      label: string;
      common: boolean;
      source: 'deal' | 'form' | 'clause' | 'unknown';
      value: string;
      filled: boolean;
    }[] = [];
    const grc = getMergeFieldRegistry(DEAL_TEMPLATE_MODULE, DEAL_TEMPLATE_AREA);
    for (const m of (content ?? '').matchAll(/\{\{(\w+)\}\}/g)) {
      const token = m[1];
      if (seen.has(token)) continue;
      seen.add(token);
      const def =
        grc.find((f) => f.token === token) ??
        MERGE_FIELD_REGISTRY.find((f) => f.token === token);
      if (!def) {
        out.push({
          token,
          label: token,
          common: false,
          source: 'unknown',
          value: '',
          filled: false,
        });
        continue;
      }
      const value = known[token] ?? '';
      // Where the value comes from. A field that has a value already is
      // "deal" (the deal, the company profile or the system supplied it);
      // one without is either typed on the form or is simply missing.
      const source =
        def.source === 'clause'
          ? 'clause'
          : value
            ? 'deal'
            : def.source === 'form'
              ? 'form'
              : 'deal';
      out.push({
        token,
        label: def.label,
        common: !!def.common,
        source,
        value,
        filled: !!value.trim(),
      });
    }
    return out;
  }

  // What the "Generate from template" form opens with: suggested values
  // taken from the deal, the parties to pick from, our own company (the
  // default Party A) and — once a template is chosen — a readiness check
  // of its fields.
  async getDraft(tenantId: string, dealId: string, templateId?: string) {
    const deal = await this.getDeal(tenantId, dealId);
    const tenant = await loadTenantCompany(this.userModel, tenantId);
    const known = this.buildAllFields(deal, tenant);
    // Assigned when the contract is created — not a gap to fill.
    known.contractReference = 'Assigned on creation';

    let template: { _id: string; title: string } | null = null;
    let fields: ReturnType<typeof this.describeTokens> = [];
    if (templateId) {
      const t = await this.loadDealTemplate(templateId);
      template = { _id: String(t._id), title: t.title };
      fields = this.describeTokens(t.content ?? '', known);
    }

    return {
      suggested: {
        title: template ? `${deal.name} — ${template.title}` : deal.name,
        value: deal.value ?? 0,
        currency: deal.currency ?? 'USD',
        governingLaw: deal.jurisdiction ?? '',
        expiresOn: isoDate(deal.longstopDate),
      },
      ourCompany: {
        name: tenant.name,
        address: tenant.registeredAddress,
        email: tenant.email,
        representative: tenant.representative,
        representativeTitle: tenant.representativeTitle,
      },
      parties: (deal.parties ?? []).map((p: any) => ({
        side: p.side,
        name: p.name,
        title: p.title,
        email: p.email,
      })),
      template,
      fields,
    };
  }

  private async loadDealTemplate(templateId: string) {
    const t = Types.ObjectId.isValid(templateId)
      ? await this.templateModel.findById(templateId).lean()
      : null;
    if (!t) throw new NotFoundException('Template not found');
    if (
      t.status !== PlatformTemplateStatus.PUBLISHED ||
      t.moduleKey !== DEAL_TEMPLATE_MODULE ||
      t.areaKey !== DEAL_TEMPLATE_AREA
    ) {
      throw new BadRequestException(
        'This template is not a published deal-contract template.',
      );
    }
    if (!(t.content ?? '').trim()) {
      throw new BadRequestException(
        'This template has no text to build a contract from (it may be an uploaded file).',
      );
    }
    return t;
  }

  // Builds a contract inside the deal from a published template: its text
  // becomes sections (one per heading), the merge fields are saved on the
  // contract as variables and resolved wherever the document is shown.
  async generate(
    tenantId: string,
    dealId: string,
    dto: GenerateDealContractDto,
  ) {
    const deal = await this.getDeal(tenantId, dealId);
    const template = await this.loadDealTemplate(dto.templateId);
    const tenant = await loadTenantCompany(this.userModel, tenantId);

    const reference = `DC-${String(deal._id).slice(-6).toUpperCase()}-${String(
      deal.contracts.length + 1,
    ).padStart(2, '0')}`;
    const title = dto.title.trim();
    const variables = nonEmpty(
      this.buildAllFields(deal, tenant, { title, reference, dto }),
    );

    deal.contracts.push({
      name: title,
      templateId: template._id,
      templateName: template.title,
      reference,
      sections: splitTemplateIntoSections(template.content, template.title).map(
        (s) => ({ ...s, comments: [], redlines: [] }),
      ),
      variables,
      reviewLoop: { tokens: [], responses: [] },
      pdfUrl: null,
    } as any);
    await deal.save();

    const created = deal.contracts[deal.contracts.length - 1];
    return { contractId: String(created._id) };
  }
}
