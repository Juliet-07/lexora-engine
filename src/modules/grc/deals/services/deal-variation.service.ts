import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Deal, DealDocument } from '../schemas';
import { User, UserDocument } from 'src/modules/auth/schemas';
import {
  VariationStatus,
  VariationType,
} from 'src/modules/crm/tools/schemas/contract.schema';
import {
  AdvanceVariationDto,
  CreateVariationDto,
  UpdateVariationDto,
} from 'src/modules/crm/tools/dtos/contract.dto';
import {
  buildAddendumClauses,
  buildVariationClauses,
  nextVariationRef,
  variationHistory,
  variationLabel,
  VARIATION_FLOW,
  VARIATION_STATUS_LABEL,
} from 'src/common/utils/contract-variations.util';
import {
  ContractClause,
  plainToHtml,
  sameText,
} from 'src/common/utils/contract-clauses.util';
import {
  ADDED_BAR,
  badgeHtml,
  CHANGED_BAR,
  diffHtml,
  escapeHtml,
} from 'src/common/utils/contract-redline.util';
import { renderDealContractBody } from 'src/common/utils/deal.contract.util';
import {
  decodeHtmlEntities,
  htmlToParagraphs,
} from 'src/common/utils/html-to-paragraphs.util';

// Stages a deal is in once the documents have been signed.
const SIGNED_STAGES = ['CPs Tracking', 'Completion', 'Post-Completion'];

/**
 * A deal contract counts as executed once everyone has signed on the deal's
 * Signing tab, or the deal has moved past Signing (it can't have, otherwise).
 * Term sheets are never executed — they are not varied.
 */
export function dealContractExecuted(deal: any, contract?: any): boolean {
  if (contract && (contract.kind ?? 'contract') !== 'contract') return false;
  const sigs: any[] = deal?.signing?.signatories ?? [];
  if (sigs.length > 0 && sigs.every((s) => s.signed)) return true;
  return SIGNED_STAGES.includes(deal?.stage);
}

/** A term sheet that both sides have signed — its text is then fixed. */
export function termSheetSigned(deal: any, contract?: any): boolean {
  if (!contract || contract.kind !== 'term_sheet') return false;
  const block = deal?.termSheetSigning;
  const sigs: any[] = block?.signatories ?? [];
  return (
    String(block?.document?.contractId ?? '') === String(contract._id) &&
    sigs.length > 0 &&
    sigs.every((x) => x.signed)
  );
}

export const DEAL_VARIATION_BLOCKED =
  'Amendments and other variations apply once the contract has been executed — when every signatory has signed on the Signing tab, or the deal has moved past Signing. Until then, edit the contract itself.';

const NUMBERED =
  /^\s*(?:(?:clause|section|article)\s+)?(\d+(?:\.\d+)*)\s*[.):\-–—]?\s*(.*)$/i;

interface SectionClause extends ContractClause {
  /** Position in the contract's sections array. */
  index: number;
}

const plain = (html: string) =>
  decodeHtmlEntities(String(html ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

// The sections of a deal contract read as clauses. A section is one clause;
// its number comes from its title ("3. Term" → 3), otherwise its position.
// The Preamble and sections an addendum added are not clauses.
function sectionClauses(
  vars: Record<string, string>,
  sections: { title?: string; body?: string; variationRef?: string | null }[],
): SectionClause[] {
  const out: SectionClause[] = [];
  const seen = new Map<string, number>();
  let position = 0;
  sections.forEach((s, index) => {
    if (s.variationRef || !s.title || s.title === 'Preamble') return;
    position += 1;
    const title = plain(renderDealContractBody(vars, s.title));
    const m = NUMBERED.exec(title);
    let ref = m ? m[1] : String(position);
    const n = (seen.get(ref) ?? 0) + 1;
    seen.set(ref, n);
    if (n > 1) ref = `${ref} (${n})`;
    out.push({
      ref,
      title: (m && m[2] ? m[2] : title).trim() || title,
      text: htmlToParagraphs(renderDealContractBody(vars, s.body ?? ''))
        .join('\n\n')
        .trim(),
      index,
    });
  });
  return out;
}

const headingTag = (level?: number) =>
  `h${Math.min(4, Math.max(2, (level ?? 1) + 1))}`;

@Injectable()
export class DealVariationService {
  constructor(
    @InjectModel(Deal.name) private readonly dealModel: Model<DealDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  private async actorName(userId: string): Promise<string> {
    const u: any = await this.userModel
      .findById(userId)
      .select('firstName lastName email')
      .lean();
    const name = `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();
    return name || u?.email || 'Team member';
  }

  private async load(tenantId: string, dealId: string, contractId: string) {
    if (!Types.ObjectId.isValid(dealId)) {
      throw new NotFoundException('Deal not found');
    }
    const deal = await this.dealModel.findOne({
      _id: dealId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deal) throw new NotFoundException('Deal not found');
    const contract: any = (deal.contracts as any).id(contractId);
    if (!contract) throw new NotFoundException('Contract not found');
    if ((contract.kind ?? 'contract') !== 'contract') {
      throw new BadRequestException(
        'Term sheets are not varied — edit the term sheet itself.',
      );
    }
    return { deal, contract };
  }

  private assertVariable(deal: any, contract: any) {
    if (!dealContractExecuted(deal, contract)) {
      throw new BadRequestException(DEAL_VARIATION_BLOCKED);
    }
  }

  private findVariation(contract: any, ref: string) {
    const v = (contract.variations ?? []).find((x: any) => x.ref === ref);
    if (!v) throw new NotFoundException('Variation not found');
    return v;
  }

  private clausesOf(contract: any): SectionClause[] {
    return sectionClauses(contract.variables ?? {}, contract.sections ?? []);
  }

  async getClauses(tenantId: string, dealId: string, contractId: string) {
    const { deal, contract } = await this.load(tenantId, dealId, contractId);
    return {
      clauses: this.clausesOf(contract).map(({ index, ...c }) => c),
      canVary: dealContractExecuted(deal, contract),
    };
  }

  async createVariation(
    tenantId: string,
    userId: string,
    dealId: string,
    contractId: string,
    dto: CreateVariationDto,
  ) {
    const { deal, contract } = await this.load(tenantId, dealId, contractId);
    this.assertVariable(deal, contract);
    const title = String(dto.title ?? '').trim();
    if (!title) throw new BadRequestException('Give the variation a title.');

    const actor = await this.actorName(userId);
    const ref = nextVariationRef(contract.variations, [], dto.type);
    const isAddendum = dto.type === VariationType.ADDENDUM;
    const history = [
      variationHistory(
        actor,
        `Created ${variationLabel(dto.type).toLowerCase()} ${ref}`,
      ),
    ];
    if (dto.submit) {
      history.unshift(variationHistory(actor, 'Submitted for review'));
    }
    contract.variations.push({
      ref,
      type: dto.type,
      title,
      status: dto.submit ? VariationStatus.REVIEW : VariationStatus.DRAFT,
      reason: (dto.reason ?? '').trim(),
      effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : null,
      clauses: isAddendum
        ? []
        : buildVariationClauses(
            this.clausesOf(contract),
            dto.type,
            dto.clauses ?? [],
          ),
      addendumClauses: isAddendum
        ? buildAddendumClauses(dto.addendumClauses ?? [])
        : [],
      createdBy: actor,
      approvedBy: null,
      executedBy: null,
      executedDate: null,
      history,
    });
    deal.markModified('contracts');
    await deal.save();
    return this.findVariation(contract, ref).toObject();
  }

  async updateVariation(
    tenantId: string,
    userId: string,
    dealId: string,
    contractId: string,
    ref: string,
    dto: UpdateVariationDto,
  ) {
    const { deal, contract } = await this.load(tenantId, dealId, contractId);
    this.assertVariable(deal, contract);
    const v = this.findVariation(contract, ref);
    if (v.status !== VariationStatus.DRAFT) {
      throw new BadRequestException(
        'Only a draft can be edited. Return it to draft first.',
      );
    }
    if (dto.title !== undefined) {
      const t = dto.title.trim();
      if (!t) throw new BadRequestException('Give the variation a title.');
      v.title = t;
    }
    if (dto.reason !== undefined) v.reason = dto.reason.trim();
    if (dto.effectiveDate !== undefined) {
      v.effectiveDate = dto.effectiveDate ? new Date(dto.effectiveDate) : null;
    }
    if (v.type === VariationType.ADDENDUM) {
      if (dto.addendumClauses) {
        v.addendumClauses = buildAddendumClauses(dto.addendumClauses) as any;
      }
    } else if (dto.clauses) {
      // Re-reads the clause text, so a draft started before another
      // variation changed the same clause is brought up to date.
      v.clauses = buildVariationClauses(
        this.clausesOf(contract),
        v.type,
        dto.clauses,
      ) as any;
    }
    v.history.unshift(
      variationHistory(await this.actorName(userId), 'Edited draft'),
    );
    deal.markModified('contracts');
    await deal.save();
    return this.findVariation(contract, ref).toObject();
  }

  async deleteVariation(
    tenantId: string,
    dealId: string,
    contractId: string,
    ref: string,
  ) {
    const { deal, contract } = await this.load(tenantId, dealId, contractId);
    const v = this.findVariation(contract, ref);
    if (v.status !== VariationStatus.DRAFT) {
      throw new BadRequestException('Only a draft can be deleted.');
    }
    contract.variations = contract.variations.filter((x: any) => x.ref !== ref);
    deal.markModified('contracts');
    await deal.save();
    return { deleted: true, ref };
  }

  async advanceVariation(
    tenantId: string,
    userId: string,
    dealId: string,
    contractId: string,
    ref: string,
    dto: AdvanceVariationDto,
  ) {
    const { deal, contract } = await this.load(tenantId, dealId, contractId);
    const v = this.findVariation(contract, ref);
    const to = dto.to as VariationStatus;
    if (!VARIATION_FLOW[v.status]?.includes(to)) {
      throw new BadRequestException(
        `A variation that is ${v.status} cannot move to ${to}.`,
      );
    }
    const actor = await this.actorName(userId);
    if (to === VariationStatus.EXECUTED) {
      this.assertVariable(deal, contract);
      this.apply(contract, v);
      v.executedDate = new Date();
      v.executedBy = actor;
    }
    if (to === VariationStatus.APPROVED) v.approvedBy = actor;
    if (to === VariationStatus.DRAFT) v.approvedBy = null;
    v.status = to;
    v.history.unshift(variationHistory(actor, VARIATION_STATUS_LABEL[to]));
    deal.markModified('contracts');
    await deal.save();
    return this.findVariation(contract, ref).toObject();
  }

  // Writes an approved variation into the contract's sections. Refuses (and
  // changes nothing) if a clause it relies on has since been changed.
  private apply(contract: any, v: any) {
    const snapshot = () => {
      if (contract.originalSections == null) {
        contract.originalSections = (contract.sections ?? [])
          .filter((s: any) => !s.variationRef)
          .map((s: any) => ({
            title: s.title,
            level: s.level ?? 1,
            body: s.body,
          }));
      }
    };

    if (v.type === VariationType.ADDENDUM) {
      snapshot();
      contract.sections.push({
        title: `Addendum ${v.ref} — ${v.title}`,
        level: 1,
        // A section's body can't be empty: the reason stands in as its intro.
        body: plainToHtml(v.reason || v.title),
        variationRef: v.ref,
      });
      for (const c of v.addendumClauses) {
        contract.sections.push({
          title: `${c.ref}. ${c.title}`,
          level: 2,
          body: plainToHtml(c.text),
          variationRef: v.ref,
        });
      }
      return;
    }

    const current = this.clausesOf(contract);
    for (const vc of v.clauses) {
      const cur = current.find((x) => x.ref === vc.ref);
      if (!cur) {
        throw new ConflictException(
          `Clause ${vc.ref} no longer exists in the contract, so ${v.ref} cannot be applied.`,
        );
      }
      if (!sameText(cur.text, vc.original)) {
        throw new ConflictException(
          `Clause ${vc.ref} has been changed since ${v.ref} was drafted. Return it to draft and open it for editing to refresh it, then submit again.`,
        );
      }
    }
    snapshot();
    for (const vc of v.clauses) {
      const cur = current.find((x) => x.ref === vc.ref)!;
      contract.sections[cur.index].body = plainToHtml(vc.amended);
    }
  }

  // The contract text for the full-document view: as it reads now, as it
  // was executed, or with every executed variation marked as a redline.
  async getDocument(
    tenantId: string,
    dealId: string,
    contractId: string,
    mode: 'current' | 'original' | 'redline',
  ) {
    const { contract } = await this.load(tenantId, dealId, contractId);
    const vars = contract.variables ?? {};
    const executed = (contract.variations ?? [])
      .filter((v: any) => v.status === VariationStatus.EXECUTED)
      .sort(
        (a: any, b: any) =>
          new Date(a.executedDate).getTime() -
          new Date(b.executedDate).getTime(),
      );
    // The clause each executed variation last changed (a later one wins).
    const changed = new Map<
      string,
      { varRef: string; action: string; text: string }
    >();
    for (const v of executed) {
      for (const c of v.clauses ?? []) {
        changed.set(c.ref, {
          varRef: v.ref,
          action: c.action,
          text: c.amended,
        });
      }
    }

    const live: any[] = (contract.sections ?? []).map((s: any) => ({
      title: s.title,
      level: s.level ?? 1,
      body: s.body,
      variationRef: s.variationRef ?? null,
    }));
    const original: any[] = contract.originalSections ?? live;
    const base = mode === 'current' ? live : original;
    const baseClauses = sectionClauses(vars, base);
    const refByIndex = new Map(baseClauses.map((c) => [c.index, c]));

    const parts: string[] = [
      `<h1>${escapeHtml(contract.name)}</h1>`,
      contract.reference
        ? `<p style="color:#667085">${escapeHtml(contract.reference)}</p>`
        : '',
    ];
    const render = (s: any, extra = '', bodyHtml?: string, bar?: string) => {
      const tag = headingTag(s.level);
      const title = renderDealContractBody(vars, s.title);
      const body = bodyHtml ?? renderDealContractBody(vars, s.body ?? '');
      parts.push(
        `<${tag}>${title}${extra}</${tag}>` +
          (body.trim()
            ? bar
              ? `<div style="${bar}">${body}</div>`
              : body
            : ''),
      );
    };

    base.forEach((s, index) => {
      if (s.variationRef && mode !== 'current') return;
      if (s.variationRef) {
        // An executed addendum's sections (current view).
        render(
          s,
          s.level === 1 ? badgeHtml(s.variationRef, undefined, 'addendum') : '',
          undefined,
          s.level === 1 ? undefined : ADDED_BAR,
        );
        return;
      }
      const clause = refByIndex.get(index);
      const mark = clause ? changed.get(clause.ref) : undefined;
      if (!mark || mode === 'original') return render(s);
      if (mode === 'current') {
        return render(
          s,
          badgeHtml(mark.varRef, mark.action),
          undefined,
          CHANGED_BAR,
        );
      }
      // Redline: the signed wording against what it reads now.
      if (sameText(mark.text, clause!.text)) return render(s);
      render(
        s,
        badgeHtml(mark.varRef, mark.action),
        diffHtml(clause!.text, mark.text),
        CHANGED_BAR,
      );
    });

    if (mode === 'redline') {
      for (const v of executed.filter(
        (x: any) => x.type === VariationType.ADDENDUM,
      )) {
        parts.push(
          `<h2>Addendum ${escapeHtml(v.ref)} — ${escapeHtml(v.title)}${badgeHtml(v.ref, undefined, 'addendum')}</h2>`,
        );
        for (const c of v.addendumClauses ?? []) {
          parts.push(
            `<h3>${escapeHtml(c.ref)}. ${escapeHtml(c.title)}</h3>` +
              `<div style="${ADDED_BAR}">${plainToHtml(c.text)}</div>`,
          );
        }
      }
    }
    return {
      mode,
      html: parts.join(''),
      executedCount: executed.length,
    };
  }
}
