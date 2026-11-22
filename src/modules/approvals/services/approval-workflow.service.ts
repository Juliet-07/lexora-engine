import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import {
  AccountStatus,
  StaffRole,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import {
  APPROVAL_MODULES,
  ApprovalModuleKey,
  ApprovalWorkflow,
  ApprovalWorkflowDocument,
} from '../schemas/approval.schema';
import {
  Chain,
  ChainActor,
  StepTemplate,
  canDecide,
  currentStep,
  decideChain,
  startChain,
  toChain,
  voidApproval,
} from '../approval-chain.logic';
import { SaveWorkflowDto } from '../dtos/approval.dto';

// Staff roles that give access to each approval area. Only people with
// one of these can be placed in a chain for it.
export const WORKFLOW_ROLES: Record<ApprovalModuleKey, StaffRole[]> = {
  crm_contracts: [StaffRole.CRM_MANAGER],
  grc_deals: [StaffRole.RISK_OFFICER, StaffRole.GRC_COMPLIANCE_OFFICER],
};

export const WORKFLOW_LABEL: Record<ApprovalModuleKey, string> = {
  crm_contracts: 'CRM contracts',
  grc_deals: 'GRC deal contracts',
};

export interface RequestUser {
  sub: string;
  tenantId?: string;
  userType: string;
  roles?: string[];
}

export interface ItemContext {
  // What the notification should call the thing, e.g. `Contract “MSA”`.
  label: string;
  // Tenant-app route the notification opens.
  link: string;
}

@Injectable()
export class ApprovalWorkflowService {
  constructor(
    @InjectModel(ApprovalWorkflow.name)
    private readonly workflowModel: Model<ApprovalWorkflowDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly events: EventEmitter2,
  ) {}

  // ── helpers ─────────────────────────────────────────────────────────
  static assertModule(key: string): ApprovalModuleKey {
    if (!(APPROVAL_MODULES as readonly string[]).includes(key))
      throw new BadRequestException('Unknown approval area.');
    return key as ApprovalModuleKey;
  }

  static tenantOf(user: RequestUser): string {
    return String(user.tenantId || user.sub);
  }

  static isOwner(user: RequestUser) {
    return user.userType === UserType.TENANT;
  }

  private fullName(u: any, fallback = 'A team member') {
    return (
      [u?.firstName, u?.lastName].filter(Boolean).join(' ') ||
      u?.tenantProfile?.businessName ||
      fallback
    );
  }

  async actorFor(user: RequestUser): Promise<ChainActor> {
    const u: any = await this.userModel
      .findById(user.sub)
      .select('firstName lastName tenantProfile.businessName')
      .lean();
    const owner = ApprovalWorkflowService.isOwner(user);
    return {
      id: String(user.sub),
      isOwner: owner,
      name: this.fullName(u, owner ? 'Account owner' : 'A team member'),
    };
  }

  // Employees that may be placed in a chain for this area.
  async eligiblePeople(tenantId: string, key: ApprovalModuleKey) {
    const rows: any[] = await this.userModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        userType: UserType.EMPLOYEE,
        roles: { $in: WORKFLOW_ROLES[key] },
        status: { $ne: AccountStatus.INACTIVE },
      })
      .select('firstName lastName email position roles')
      .sort({ firstName: 1, lastName: 1 })
      .lean();
    return rows.map((r) => ({
      id: String(r._id),
      name: this.fullName(r, r.email),
      email: r.email ?? '',
      position: r.position ?? '',
    }));
  }

  // ── workflow (what the owner configures) ────────────────────────────
  async getRaw(tenantId: string, key: ApprovalModuleKey) {
    return this.workflowModel
      .findOne({ tenantId: new Types.ObjectId(tenantId), module: key })
      .lean();
  }

  isConfigured(w: any) {
    return (
      !!w && ((w.drafterIds?.length ?? 0) > 0 || (w.steps?.length ?? 0) > 0)
    );
  }

  async isConfiguredFor(tenantId: string, key: ApprovalModuleKey) {
    return this.isConfigured(await this.getRaw(tenantId, key));
  }

  async canDraft(user: RequestUser, key: ApprovalModuleKey) {
    if (ApprovalWorkflowService.isOwner(user)) return true;
    const w: any = await this.getRaw(
      ApprovalWorkflowService.tenantOf(user),
      key,
    );
    return !!w?.drafterIds?.some((d: any) => String(d) === String(user.sub));
  }

  // Everything the workflow screen and the contract screens need.
  async view(user: RequestUser, key: ApprovalModuleKey) {
    const tenantId = ApprovalWorkflowService.tenantOf(user);
    const owner = ApprovalWorkflowService.isOwner(user);
    if (!owner) {
      const roles = user.roles ?? [];
      if (!roles.some((r) => (WORKFLOW_ROLES[key] as string[]).includes(r)))
        throw new ForbiddenException('You do not have access to this area.');
    }
    const w: any = await this.getRaw(tenantId, key);
    const eligible = await this.eligiblePeople(tenantId, key);
    const nameOf = new Map(eligible.map((p) => [p.id, p]));
    // People removed from the team since the chain was saved still show by id
    // as "Former team member" rather than silently vanishing.
    const person = (id: any) => {
      const p = nameOf.get(String(id));
      return {
        id: String(id),
        name: p?.name ?? 'Former team member',
        email: p?.email ?? '',
        position: p?.position ?? '',
        active: !!p,
      };
    };
    const myId = String(user.sub);
    const drafters = (w?.drafterIds ?? []).map(person);
    const steps = (w?.steps ?? []).map((s: any) => ({
      id: String(s._id),
      name: s.name,
      kind: s.kind,
      people: (s.userIds ?? []).map(person),
    }));
    return {
      module: key,
      label: WORKFLOW_LABEL[key],
      configured: this.isConfigured(w),
      drafters,
      steps,
      updatedByName: w?.updatedByName ?? '',
      updatedAt: w?.updatedAt ?? null,
      // Employees get no one else's details beyond the chain itself.
      eligible: owner ? eligible : [],
      me: {
        isOwner: owner,
        canDraft: owner || drafters.some((d: any) => d.id === myId),
        stepNames: steps
          .filter((s: any) => s.people.some((p: any) => p.id === myId))
          .map((s: any) => s.name),
      },
    };
  }

  async save(user: RequestUser, key: ApprovalModuleKey, dto: SaveWorkflowDto) {
    if (!ApprovalWorkflowService.isOwner(user))
      throw new ForbiddenException(
        'Only the account owner can set up the approval chain.',
      );
    const tenantId = ApprovalWorkflowService.tenantOf(user);
    const eligible = new Set(
      (await this.eligiblePeople(tenantId, key)).map((p) => p.id),
    );
    const known = (ids: string[], where: string) => {
      const unique = [...new Set(ids)];
      for (const id of unique)
        if (!eligible.has(id))
          throw new BadRequestException(
            `${where}: someone chosen is not an active team member with access to ${WORKFLOW_LABEL[key]}.`,
          );
      return unique.map((id) => new Types.ObjectId(id));
    };
    const drafterIds = known(dto.drafterIds ?? [], 'Drafters');
    const steps = (dto.steps ?? []).map((s, i) => {
      const userIds = known(s.userIds ?? [], `Step ${i + 1}`);
      if (!userIds.length)
        throw new BadRequestException(
          `Step ${i + 1} (${s.name}) needs at least one person.`,
        );
      return { name: s.name.trim(), kind: s.kind, userIds };
    });
    if (steps.length && !drafterIds.length)
      throw new BadRequestException(
        'Choose at least one drafter — otherwise only you can submit anything.',
      );
    const actor = await this.actorFor(user);
    await this.workflowModel.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId), module: key },
      {
        $set: {
          drafterIds,
          steps,
          updatedById: new Types.ObjectId(user.sub),
          updatedByName: actor.name,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return this.view(user, key);
  }

  // ── guard support ───────────────────────────────────────────────────
  // Where does this person sit in the chain? Owners are never held back.
  // An employee only gets into the area at all if the owner has put them in
  // the chain, and can only change things as a drafter.
  async role(user: RequestUser, key: ApprovalModuleKey) {
    if (ApprovalWorkflowService.isOwner(user))
      return { owner: true, drafter: true, onChain: true };
    const w: any = await this.getRaw(
      ApprovalWorkflowService.tenantOf(user),
      key,
    );
    const me = String(user.sub);
    const drafter = !!w?.drafterIds?.some((d: any) => String(d) === me);
    const reviewer = !!w?.steps?.some((s: any) =>
      s.userIds?.some((u: any) => String(u) === me),
    );
    return { owner: false, drafter, onChain: drafter || reviewer };
  }

  // ── per-item chain ──────────────────────────────────────────────────
  private async templates(tenantId: string, w: any): Promise<StepTemplate[]> {
    const ids = new Set<string>();
    for (const s of w?.steps ?? [])
      for (const id of s.userIds ?? []) ids.add(String(id));
    const users: any[] = ids.size
      ? await this.userModel
          .find({
            _id: { $in: [...ids].map((i) => new Types.ObjectId(i)) },
            tenantId: new Types.ObjectId(tenantId),
            status: { $ne: AccountStatus.INACTIVE },
          })
          .select('firstName lastName email')
          .lean()
      : [];
    const byId = new Map(
      users.map((u) => [String(u._id), this.fullName(u, u.email)]),
    );
    return (w?.steps ?? []).map((s: any) => ({
      name: s.name,
      kind: s.kind,
      // People who have since left the team are dropped from the step; a step
      // with nobody left is skipped rather than stalling the contract.
      people: (s.userIds ?? [])
        .map(String)
        .filter((id: string) => byId.has(id))
        .map((id: string) => ({ id, name: byId.get(id)! })),
    }));
  }

  /**
   * Submit (or resubmit after a send-back) an item. Returns the new chain
   * to store on the item. Only a drafter (or the owner) may submit.
   */
  async submit(
    user: RequestUser,
    key: ApprovalModuleKey,
    current: any,
    ctx: ItemContext,
  ): Promise<Chain> {
    const tenantId = ApprovalWorkflowService.tenantOf(user);
    const actor = await this.actorFor(user);
    const w: any = await this.getRaw(tenantId, key);
    if (!actor.isOwner) {
      if (!this.isConfigured(w))
        throw new ForbiddenException(
          'The account owner has not set up an approval chain yet.',
        );
      if (!(await this.canDraft(user, key)))
        throw new ForbiddenException(
          'You are not a drafter for this approval chain.',
        );
    }
    const run = toChain(current);
    if (run.status === 'In approval')
      throw new BadRequestException('This is already with the approvers.');
    if (run.status === 'Approved')
      throw new BadRequestException('This is already approved.');
    const next = startChain(run, await this.templates(tenantId, w), actor);
    await this.notify(tenantId, actor, run, next, ctx);
    return next;
  }

  /** Approve, or send back with a reason. Returns the updated chain. */
  async decide(
    user: RequestUser,
    key: ApprovalModuleKey,
    current: any,
    decision: 'Approved' | 'Sent back',
    note: string,
    ctx: ItemContext,
  ): Promise<Chain> {
    const tenantId = ApprovalWorkflowService.tenantOf(user);
    const actor = await this.actorFor(user);
    const before = toChain(current);
    const check = canDecide(before, actor);
    if (!check.ok) throw new ForbiddenException(check.reason);
    let after: Chain;
    try {
      after = decideChain(toChain(current), actor, decision, note);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
    await this.notify(tenantId, actor, before, after, ctx);
    return after;
  }

  // Changing an approved item voids the approval. Returns null when nothing
  // needs to change.
  async voidIfApproved(
    user: RequestUser,
    current: any,
    reason: string,
  ): Promise<Chain | null> {
    const run = toChain(current);
    if (run.status !== 'Approved') return null;
    const actor = await this.actorFor(user);
    return voidApproval(run, actor.name, reason);
  }

  /** Is this item locked from editing? In approval = yes. */
  isLocked(current: any) {
    return toChain(current).status === 'In approval';
  }

  /** Refuses edits while the chain is mid-review. */
  assertEditable(current: any) {
    if (this.isLocked(current))
      throw new BadRequestException(
        'This is with the approvers and cannot be edited. Ask them to send it back first.',
      );
  }

  // True when this item may move on to signing / the client: an approval
  // chain is not set up, or it has been approved.
  async isCleared(tenantId: string, key: ApprovalModuleKey, current: any) {
    if (!(await this.isConfiguredFor(tenantId, key))) return true;
    return toChain(current).status === 'Approved';
  }

  async assertCleared(
    tenantId: string,
    key: ApprovalModuleKey,
    current: any,
    action: string,
  ) {
    if (await this.isCleared(tenantId, key, current)) return;
    const run = toChain(current);
    const where =
      run.status === 'In approval'
        ? `It is with ${currentStep(run)?.name ?? 'the approvers'} now.`
        : run.status === 'Sent back'
          ? 'It was sent back and needs to be resubmitted.'
          : 'It has not been submitted for approval yet.';
    throw new BadRequestException(
      `It must be approved before ${action}. ${where}`,
    );
  }

  // ── notifications ───────────────────────────────────────────────────
  private async notify(
    tenantId: string,
    actor: ChainActor,
    before: Chain,
    after: Chain,
    ctx: ItemContext,
  ) {
    const send = (recipients: string[], title: string, description: string) => {
      for (const r of new Set(recipients.filter((x) => x && x !== actor.id)))
        this.events.emit('approval.notify', {
          tenantId,
          recipientId: r,
          title,
          description,
          link: ctx.link,
        });
    };
    if (after.status === 'In approval') {
      const step = currentStep(after);
      if (!step) return;
      send(
        step.kind === 'Owner' ? [tenantId] : step.userIds,
        `${ctx.label} needs your ${step.kind === 'Reviewer' ? 'review' : 'approval'}`,
        `${after.submittedByName || 'A drafter'} submitted it. You are on “${step.name}”.`,
      );
    } else if (after.status === 'Approved') {
      send(
        [after.submittedById ?? '', tenantId],
        `${ctx.label} was approved`,
        `${actor.name} gave the final approval. It can now go for signing.`,
      );
    } else if (after.status === 'Sent back') {
      send(
        [after.submittedById ?? ''],
        `${ctx.label} was sent back`,
        `${actor.name}: ${after.sentBackReason}`,
      );
    }
  }
}
