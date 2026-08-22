import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment, CommentDocument, CommentSubjectType } from '../schemas';
import { AddCommentDto, EditCommentDto, ToggleReactionDto } from '../dtos';
import { EmployeeService } from 'src/modules/hr/services/employee.service';
import {
  Contract,
  ContractDocument_,
  ContractStage,
  CONTRACT_STAGES,
} from '../schemas';
import {
  CreateContractDto,
  ExecuteContractDto,
  AddNegotiationRoundDto,
  AddAmendmentDto,
  AddObligationDto,
  SetObligationDoneDto,
} from '../dtos';

@Injectable()
export class CommentService {
  constructor(
    @InjectModel(Comment.name)
    private readonly model: Model<CommentDocument>,
    private readonly employeeService: EmployeeService,
  ) {}

  // Reconstructs the real nested tree the frontend expects from a
  // flat collection with real parentId references — Mongo doesn't
  // handle arbitrarily deep nested subdocuments well, so replies are
  // never stored nested, only presented that way.
  private buildTree(flat: any[]): any[] {
    const byId = new Map(
      flat.map((c) => [String(c._id), { ...c, replies: [] as any[] }]),
    );
    const roots: any[] = [];
    for (const c of flat) {
      const node = byId.get(String(c._id));
      if (c.parentId) {
        const parent = byId.get(String(c.parentId));
        // A parent that's been hard-deleted (shouldn't normally
        // happen, since delete is soft) falls back to top-level
        // rather than silently vanishing the reply.
        if (parent) parent.replies.push(node);
        else roots.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async getThread(
    tenantId: string,
    subjectType: CommentSubjectType,
    subjectId: string,
  ) {
    const flat = await this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        subjectType,
        subjectId: new Types.ObjectId(subjectId),
      })
      .sort({ createdAt: 1 })
      .lean();
    return this.buildTree(
      flat.map((c) => ({
        ...c,
        reactions: c.reactions ? Object.fromEntries(c.reactions as any) : {},
      })),
    );
  }

  async addComment(
    tenantId: string,
    subjectType: CommentSubjectType,
    subjectId: string,
    dto: AddCommentDto,
  ) {
    const created = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      subjectType,
      subjectId: new Types.ObjectId(subjectId),
      parentId: dto.parentId ? new Types.ObjectId(dto.parentId) : null,
      author: dto.author,
      body: dto.body,
    });
    return created.toObject();
  }

  async editComment(tenantId: string, commentId: string, dto: EditCommentDto) {
    const c = await this.model.findOne({
      _id: commentId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Comment not found');
    c.body = dto.body;
    c.edited = true;
    await c.save();
    return c.toObject();
  }

  // Soft delete — the thread structure (replies to this comment)
  // stays intact, matching the mockup's own "This comment was
  // deleted" placeholder rather than orphaning real replies.
  async deleteComment(tenantId: string, commentId: string) {
    const c = await this.model.findOne({
      _id: commentId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Comment not found');
    c.deleted = true;
    c.deletedAt = new Date();
    await c.save();
    return c.toObject();
  }

  async toggleReaction(
    tenantId: string,
    commentId: string,
    dto: ToggleReactionDto,
  ) {
    const c = await this.model.findOne({
      _id: commentId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Comment not found');
    const current = c.reactions.get(dto.emoji) ?? [];
    const next = current.includes(dto.author)
      ? current.filter((u) => u !== dto.author)
      : [...current, dto.author];
    c.reactions.set(dto.emoji, next);
    c.markModified('reactions');
    await c.save();
    return c.toObject();
  }

  // Real employee directory for @mention autocomplete — no fake
  // online/away/DND presence, since there's no real presence system
  // anywhere in this platform to back that with.
  async getMentionDirectory(tenantId: string) {
    const employees = await this.employeeService.getEmployeeDirectory(tenantId);
    return employees.map((e) => ({
      name: `${e.firstName} ${e.lastName}`,
      role: e.jobTitle,
    }));
  }
}

@Injectable()
export class ContractService {
  constructor(
    @InjectModel(Contract.name)
    private readonly model: Model<ContractDocument_>,
  ) {}

  private async nextRef(tenantId: Types.ObjectId): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.model.countDocuments({
      tenantId,
      ref: new RegExp(`^CTR-${year}-`),
    });
    return `CTR-${year}-${String(count + 1).padStart(2, '0')}`;
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getById(tenantId: string, id: string) {
    const c = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!c) throw new NotFoundException('Contract not found');
    return c;
  }

  async create(tenantId: string, dto: CreateContractDto) {
    const tId = new Types.ObjectId(tenantId);
    const ref = await this.nextRef(tId);
    const created = await this.model.create({
      tenantId: tId,
      ref,
      title: dto.title,
      counterparty: dto.counterparty,
      type: dto.type,
      value: dto.value ?? 0,
      currency: dto.currency ?? 'USD',
      expiresOn: new Date(dto.expiresOn),
      autoRenew: dto.autoRenew ?? false,
      owner: dto.owner ?? '',
      mandateId: dto.mandateId ? new Types.ObjectId(dto.mandateId) : null,
      mandateName: dto.mandateName ?? '',
    });
    return created.toObject();
  }

  // Simple forward progression through the real stage sequence — no
  // skipping, matching a real contract's own lifecycle discipline.
  async advanceStage(tenantId: string, id: string) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    const i = CONTRACT_STAGES.indexOf(c.stage);
    if (i === CONTRACT_STAGES.length - 1) {
      throw new BadRequestException(
        'This contract is already at its final stage',
      );
    }
    c.stage = CONTRACT_STAGES[i + 1];
    await c.save();
    return c.toObject();
  }

  // Execution is a real, distinct event — capturing signature,
  // moving straight to Active and setting real executed/effective
  // dates, not just another generic stage advance. Only valid from
  // Execution, since a contract can't be signed before it's reached
  // that stage.
  async executeContract(tenantId: string, id: string, dto: ExecuteContractDto) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    if (c.stage !== ContractStage.EXECUTION) {
      throw new BadRequestException(
        'Only a contract in Execution can be marked executed',
      );
    }
    c.stage = ContractStage.ACTIVE;
    c.executedOn = new Date(dto.executedOn);
    c.effectiveOn = new Date(dto.effectiveOn);
    await c.save();
    return c.toObject();
  }

  async initiateRenewal(tenantId: string, id: string) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    c.stage = ContractStage.RENEWAL;
    await c.save();
    return c.toObject();
  }

  async toggleAutoRenew(tenantId: string, id: string) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    c.autoRenew = !c.autoRenew;
    await c.save();
    return c.toObject();
  }

  async addNegotiationRound(
    tenantId: string,
    id: string,
    dto: AddNegotiationRoundDto,
  ) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    c.rounds.push({
      round: c.rounds.length + 1,
      by: dto.by,
      at: new Date(dto.at),
      summary: dto.summary,
    } as any);
    await c.save();
    return c.toObject();
  }

  async addAmendment(tenantId: string, id: string, dto: AddAmendmentDto) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    const ref = `AMD-${String(c.amendments.length + 1).padStart(2, '0')}`;
    c.amendments.push({ ref, at: new Date(), summary: dto.summary } as any);
    await c.save();
    return c.toObject();
  }

  async addObligation(tenantId: string, id: string, dto: AddObligationDto) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    c.obligations.push({
      label: dto.label,
      due: new Date(dto.due),
      type: dto.type,
      leadDays: dto.leadDays ?? 14,
      done: false,
      doneAt: null,
    } as any);
    await c.save();
    return c.toObject();
  }

  async setObligationDone(
    tenantId: string,
    id: string,
    obligationId: string,
    dto: SetObligationDoneDto,
  ) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contract not found');
    const obligation = (c.obligations as any).id(obligationId);
    if (!obligation) throw new NotFoundException('Obligation not found');
    obligation.done = dto.done;
    obligation.doneAt = dto.done ? new Date() : null;
    await c.save();
    return c.toObject();
  }

  // Real, live-computed views — never separately stored, so they
  // can never drift from the contracts they're derived from.
  async getExpiring(tenantId: string, withinDays = 90) {
    const cutoff = new Date(Date.now() + withinDays * 86400000);
    return this.model
      .find({
        tenantId: new Types.ObjectId(tenantId),
        expiresOn: { $gte: new Date(), $lte: cutoff },
      })
      .sort({ expiresOn: 1 })
      .lean();
  }

  async getObligationsDue(tenantId: string, withinDays = 90) {
    const contracts = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .lean();
    const cutoff = new Date(Date.now() + withinDays * 86400000);
    const due: any[] = [];
    for (const c of contracts) {
      for (const o of c.obligations) {
        if (!o.done && o.due <= cutoff) {
          due.push({
            ...o,
            contractId: c._id,
            contractTitle: c.title,
            contractRef: c.ref,
          });
        }
      }
    }
    return due.sort((a, b) => a.due.getTime() - b.due.getTime());
  }
}
