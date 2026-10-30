import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Deal, DealDocument } from '../schemas';
import { GenerateDealContractDto } from '../dtos/deal-contract.dto';
import { ContractService } from 'src/modules/crm/tools/services/contract.service';
import { ContractType } from 'src/modules/crm/tools/schemas/contract.schema';
import { GenerateFromTemplateDto } from 'src/modules/crm/tools/dtos/contract.dto';
import {
  MERGE_FIELD_REGISTRY,
  getMergeFieldRegistry,
} from 'src/common/utils/contract-merge-registry';
import { formatBulletList } from 'src/common/utils/contract-fields.util';

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
    private readonly contractService: ContractService,
  ) {}

  private async getDeal(tenantId: string, dealId: string) {
    if (!Types.ObjectId.isValid(dealId)) {
      throw new NotFoundException('Deal not found');
    }
    const deal = await this.dealModel
      .findOne({ _id: dealId, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  // Every token that only a deal contract has, valued from the deal. A
  // field the deal has nothing for is an empty string — it stays visible
  // as {{token}} in the document and in the Merge Fields panel, so the
  // tenant sees the gap rather than a silently incomplete agreement.
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
    const templates = await this.contractService.getPublishedPlatformTemplates(
      DEAL_TEMPLATE_MODULE,
      DEAL_TEMPLATE_AREA,
    );
    return templates.map((t) => this.slimTemplate(t));
  }

  // Every distinct {{token}} in a template, classified by where its value
  // will come from on a deal contract:
  //   deal        — read from the deal record (value shown if present)
  //   auto        — filled by the system (our company name, today's date)
  //   form        — typed on the generate form (title, counterparty, …)
  //   unavailable — a real field, but not one a deal contract can fill
  //   unknown     — not in the field registry at all (a typo, or a custom
  //                 token): it will stay as literal {{token}} text
  describeTokens(content: string, dealFields: Record<string, string>) {
    const seen = new Set<string>();
    const out: {
      token: string;
      label: string;
      source: 'deal' | 'auto' | 'form' | 'unavailable' | 'unknown';
      value: string;
      filled: boolean;
    }[] = [];
    const grc = getMergeFieldRegistry(DEAL_TEMPLATE_MODULE);
    for (const m of (content ?? '').matchAll(/\{\{(\w+)\}\}/g)) {
      const token = m[1];
      if (seen.has(token)) continue;
      seen.add(token);
      const def = grc.find((f) => f.token === token);
      if (def) {
        const source =
          def.source === 'record'
            ? 'deal'
            : def.source === 'auto'
              ? 'auto'
              : 'form';
        const value = source === 'deal' ? (dealFields[token] ?? '') : '';
        out.push({
          token,
          label: def.label,
          source,
          value,
          filled: source === 'deal' ? !!value.trim() : source === 'auto',
        });
      } else {
        const known = MERGE_FIELD_REGISTRY.find((f) => f.token === token);
        out.push({
          token,
          label: known?.label ?? token,
          source: known ? 'unavailable' : 'unknown',
          value: '',
          filled: false,
        });
      }
    }
    return out;
  }

  // What the "Generate from template" form opens with: suggested values
  // taken from the deal, the deal's parties to pick a counterparty from,
  // and — once a template is chosen — a readiness check of its fields.
  async getDraft(tenantId: string, dealId: string, templateId?: string) {
    const deal = await this.getDeal(tenantId, dealId);
    const dealFields = this.buildDealMergeFields(deal);

    let template: { _id: string; title: string } | null = null;
    let fields: ReturnType<typeof this.describeTokens> = [];
    if (templateId) {
      const t = await this.loadDealTemplate(templateId);
      template = { _id: String(t._id), title: t.title };
      fields = this.describeTokens(t.content ?? '', dealFields);
    }

    const parties = ((deal as any).parties ?? []).map((p: any) => ({
      side: p.side,
      name: p.name,
      title: p.title,
      email: p.email,
    }));

    return {
      suggested: {
        title: template ? `${deal.name} — ${template.title}` : deal.name,
        type: ContractType.DEAL_AGREEMENT,
        value: deal.value ?? 0,
        currency: deal.currency ?? 'USD',
        expiresOn: isoDate((deal as any).longstopDate),
        owner:
          deal.leadPartner && deal.leadPartner !== 'Unassigned'
            ? deal.leadPartner
            : '',
      },
      parties,
      template,
      fields,
    };
  }

  private async loadDealTemplate(templateId: string) {
    let t: any;
    try {
      t = await this.contractService.getPlatformTemplate(templateId);
    } catch {
      throw new NotFoundException('Template not found');
    }
    if (
      t.status !== 'Published' ||
      t.moduleKey !== DEAL_TEMPLATE_MODULE ||
      t.areaKey !== DEAL_TEMPLATE_AREA
    ) {
      throw new BadRequestException(
        'This template is not a published deal-contract template.',
      );
    }
    return t;
  }

  async generate(
    tenantId: string,
    dealId: string,
    dto: GenerateDealContractDto,
  ) {
    const deal = await this.getDeal(tenantId, dealId);
    const template = await this.loadDealTemplate(dto.templateId);

    const gen: GenerateFromTemplateDto = {
      templateId: String(template._id),
      templateSource: 'platform',
      title: dto.title.trim(),
      type: dto.type ?? ContractType.DEAL_AGREEMENT,
      counterparty: dto.counterparty.trim(),
      counterpartyEmail: dto.counterpartyEmail,
      value: dto.value ?? deal.value ?? 0,
      currency: dto.currency ?? deal.currency ?? 'USD',
      scopeOfWork: dto.scopeOfWork ?? '',
      expiresOn: dto.expiresOn,
      owner:
        dto.owner ??
        (deal.leadPartner !== 'Unassigned' ? deal.leadPartner : ''),
    };

    const contract = await this.contractService.generateFromTemplate(
      tenantId,
      gen,
      {
        dealId: String(deal._id),
        dealName: deal.name,
        extraFields: this.buildDealMergeFields(deal),
      },
    );

    return contract;
  }

  async listContracts(tenantId: string, dealId: string) {
    await this.getDeal(tenantId, dealId);
    return this.contractService.getDealContracts(tenantId, dealId);
  }
}
