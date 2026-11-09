import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Deal, DealDocument, DealPartySide, partySide } from '../schemas';
import { User, UserDocument } from 'src/modules/auth/schemas';
import { ProposeChangeDto } from '../dtos/deal.dto';
import {
  describeLineChange,
  replaceLineInHtml,
} from 'src/common/utils/contract-tracked-changes.util';
import { htmlToParagraphs } from 'src/common/utils/html-to-paragraphs.util';
import { dealContractExecuted } from './deal-variation.service';

const norm = (s: string) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

export const REDLINE_LOCKED =
  'This contract has been executed, so it can no longer be marked up. Use the Amendments tab to vary it.';

/**
 * Negotiation on a deal contract: a side proposes new wording for a line
 * (a tracked change), the other accepts or rejects it, and the contract
 * moves from round to round with the pen passing between Party A and B.
 */
@Injectable()
export class DealChangeService {
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
    if (!contract) throw new NotFoundException('Document not found');
    return { deal, contract };
  }

  private open(deal: any, contract: any) {
    if (dealContractExecuted(deal, contract)) {
      throw new BadRequestException(REDLINE_LOCKED);
    }
  }

  private section(contract: any, index: number) {
    const s = contract.sections?.[index];
    if (!s) throw new NotFoundException('Section not found');
    if (s.variationRef) {
      throw new BadRequestException(
        'This section was added by an addendum — vary it with another variation.',
      );
    }
    return s;
  }

  async propose(
    tenantId: string,
    userId: string,
    dealId: string,
    contractId: string,
    sectionIndex: number,
    dto: ProposeChangeDto,
  ) {
    const { deal, contract } = await this.load(tenantId, dealId, contractId);
    this.open(deal, contract);
    const section = this.section(contract, sectionIndex);
    const lines = htmlToParagraphs(section.body ?? '');
    const line = lines[dto.lineIndex];
    if (line === undefined) throw new BadRequestException('Line not found');
    if (!norm(dto.text)) {
      throw new BadRequestException(
        'Enter the wording you are proposing for this line.',
      );
    }
    if (
      (section.changes ?? []).some(
        (c: any) => c.status === 'pending' && c.lineIndex === dto.lineIndex,
      )
    ) {
      throw new ConflictException(
        'This line already has a proposed change. Accept or reject it first.',
      );
    }
    const change = describeLineChange(line, dto.text);
    if (norm(change.after) === norm(line) && !change.addedLines.length) {
      throw new BadRequestException(
        'That is the same as the current wording — nothing to propose.',
      );
    }
    section.changes.push({
      ...change,
      lineIndex: dto.lineIndex,
      party: dto.party ?? contract.penParty ?? DealPartySide.PARTY_A,
      round: contract.round ?? 1,
      status: 'pending',
      authorName: await this.actorName(userId),
      createdAt: new Date(),
    });
    await deal.save();
    return { ok: true };
  }

  // Writes an accepted change into the section. Refuses (changing nothing)
  // if the line has been edited since it was proposed.
  private apply(section: any, change: any, actor: string) {
    const lines = htmlToParagraphs(section.body ?? '');
    if (norm(lines[change.lineIndex]) !== norm(change.before)) {
      throw new ConflictException(
        'That line has been edited since the change was proposed, so it cannot be applied. Reject it and propose it again.',
      );
    }
    const body = replaceLineInHtml(
      section.body ?? '',
      change.before,
      change.after,
      change.addedLines ?? [],
    );
    if (body === null) {
      throw new ConflictException(
        'This change cannot be applied automatically because the line is split by formatting. Reject it and make the edit on the Edit tab.',
      );
    }
    if (section.draftBody == null) section.draftBody = section.body;
    section.body = body;
    change.status = 'accepted';
    change.decidedBy = actor;
    change.decidedAt = new Date();
    const added = (change.addedLines ?? []).length;
    if (added) {
      for (const c of section.changes) {
        if (c.status === 'pending' && c.lineIndex > change.lineIndex) {
          c.lineIndex += added;
        }
      }
    }
  }

  async decide(
    tenantId: string,
    userId: string,
    dealId: string,
    contractId: string,
    sectionIndex: number,
    changeId: string,
    decision: 'accept' | 'reject',
  ) {
    const { deal, contract } = await this.load(tenantId, dealId, contractId);
    this.open(deal, contract);
    const section = this.section(contract, sectionIndex);
    const change = section.changes.id(changeId);
    if (!change) throw new NotFoundException('Change not found');
    if (change.status !== 'pending') {
      throw new BadRequestException('That change has already been accepted.');
    }
    if (decision === 'accept') {
      this.apply(section, change, await this.actorName(userId));
    } else {
      section.changes.pull(changeId);
    }
    deal.markModified('contracts');
    await deal.save();
    return { ok: true };
  }

  async decideAll(
    tenantId: string,
    userId: string,
    dealId: string,
    contractId: string,
    decision: 'accept' | 'reject',
  ) {
    const { deal, contract } = await this.load(tenantId, dealId, contractId);
    this.open(deal, contract);
    const actor = await this.actorName(userId);
    let count = 0;
    for (const section of contract.sections ?? []) {
      if (decision === 'reject') {
        const pending = (section.changes ?? []).filter(
          (c: any) => c.status === 'pending',
        );
        for (const c of pending) section.changes.pull(c._id);
        count += pending.length;
        continue;
      }
      // Top to bottom, so lines an earlier change adds shift the later ones.
      const pending = (section.changes ?? [])
        .filter((c: any) => c.status === 'pending')
        .sort((a: any, b: any) => a.lineIndex - b.lineIndex);
      for (const c of pending) {
        this.apply(section, c, actor);
        count += 1;
      }
    }
    if (count) {
      deal.markModified('contracts');
      await deal.save();
    }
    return { ok: true, count };
  }

  // Ends the current round: the next one starts with the other side holding
  // the pen.
  async advanceRound(tenantId: string, dealId: string, contractId: string) {
    const { deal, contract } = await this.load(tenantId, dealId, contractId);
    this.open(deal, contract);
    contract.round = (contract.round ?? 1) + 1;
    contract.penParty =
      partySide(contract.penParty) === DealPartySide.PARTY_A
        ? DealPartySide.PARTY_B
        : DealPartySide.PARTY_A;
    await deal.save();
    return { round: contract.round, penParty: contract.penParty };
  }
}
