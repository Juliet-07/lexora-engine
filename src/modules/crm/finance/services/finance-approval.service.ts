import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import {
  AccountStatus,
  StaffRole,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { FinanceSettingsService } from './finance-settings.service';
import {
  ApprovalActor,
  ApprovalState,
  canApprove,
  recordApproval,
  recordRejection,
  routeApproval,
} from './finance-approval.logic';

export interface FinanceActor {
  id: string;
  name: string;
  userType: string;
}
export const toApprovalActor = (a: FinanceActor): ApprovalActor => ({
  id: a.id,
  name: a.name,
  isOwner: a.userType === UserType.TENANT,
});

// Routes employee-submitted bills and quotes to the people who may
// approve them, per Finance Settings → Approvals, and keeps everyone
// in the loop. The account owner always has the final say.
@Injectable()
export class FinanceApprovalService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly settingsService: FinanceSettingsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async actorFor(
    userId: string,
    tenantId: string,
    userType: string,
  ): Promise<FinanceActor> {
    const u: any = await this.userModel
      .findById(userId)
      .select('firstName lastName tenantProfile.businessName')
      .lean();
    return {
      id: userId,
      userType,
      name:
        [u?.firstName, u?.lastName].filter(Boolean).join(' ') ||
        u?.tenantProfile?.businessName ||
        (userType === UserType.TENANT ? 'Account owner' : 'A team member'),
    };
  }

  private async rules(tenantId: string) {
    const all: any = await this.settingsService.getAll(tenantId);
    return {
      tiers: all?.settings?.approvals?.tiers ?? [],
      rules: all?.settings?.approvals?.rules ?? {},
    };
  }

  private async financeManagers(tenantId: string) {
    return this.userModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        userType: UserType.EMPLOYEE,
        roles: StaffRole.FINANCE_MANAGER,
        status: { $ne: AccountStatus.INACTIVE },
      })
      .select('firstName lastName')
      .lean();
  }

  // Builds the approval state stored on a bill or quote.
  async route(
    tenantId: string,
    amount: number,
    submitterId: string,
    ignoreTiers = false,
  ): Promise<ApprovalState> {
    const { tiers, rules } = await this.rules(tenantId);
    const fms = await this.financeManagers(tenantId);
    const routed = routeApproval({
      amount,
      submitterId,
      tiers,
      rules,
      financeManagerIds: fms.map((f: any) => String(f._id)),
      ignoreTiers,
    });
    // Names for display ("Waiting on Aline and Jean"), resolved once.
    const named = routed.approverIds.length
      ? await this.userModel
          .find({ _id: { $in: routed.approverIds } })
          .select('firstName lastName')
          .lean()
      : [];
    const nameOf = (id: string) => {
      const u: any = named.find((n: any) => String(n._id) === id);
      return (
        [u?.firstName, u?.lastName].filter(Boolean).join(' ') || 'Approver'
      );
    };
    return {
      tierName: routed.tierName,
      mode: routed.mode,
      approverIds: routed.approverIds,
      approverNames: routed.approverIds.map(nameOf),
      approvals: [],
      submittedAt: new Date(),
    };
  }

  // Tells the approvers (and always the owner) that something waits.
  notifyRequested(
    tenantId: string,
    state: ApprovalState,
    info: {
      kind: 'Bill' | 'Quote';
      ref: string;
      submittedBy: string;
      amountLabel: string;
      link: string;
    },
  ) {
    const recipients = Array.from(new Set([tenantId, ...state.approverIds]));
    for (const recipientId of recipients) {
      this.eventEmitter.emit('finance.approval_requested', {
        tenantId,
        recipientId,
        ...info,
      });
    }
  }

  notifyDecided(
    tenantId: string,
    submitterId: string | null,
    info: {
      kind: 'Bill' | 'Quote';
      ref: string;
      decision: 'approved' | 'rejected';
      decidedBy: string;
      reason?: string;
    },
  ) {
    if (!submitterId) return;
    this.eventEmitter.emit('finance.approval_decided', {
      tenantId,
      recipientId: submitterId,
      reason: '',
      ...info,
    });
  }

  // Throws unless `actor` may act on this item.
  async assertCanDecide(
    tenantId: string,
    state: ApprovalState | null,
    submitterId: string | null,
    actor: FinanceActor,
  ) {
    const a = toApprovalActor(actor);
    if (a.isOwner) return;
    if (!state) {
      // Not employee-routed (e.g. captured by another finance user in
      // the Finance module): any finance user may act, but never on
      // something they captured themselves when self-approval is off.
      const { rules } = await this.rules(tenantId);
      if (
        rules?.selfApprovalRestriction !== false &&
        submitterId &&
        submitterId === actor.id
      )
        throw new ForbiddenException(
          'You cannot approve something you submitted.',
        );
      return;
    }
    const { rules } = await this.rules(tenantId);
    const verdict = canApprove(state, a, submitterId ?? '', rules);
    if (!verdict.ok) throw new ForbiddenException(verdict.reason);
  }

  record(state: ApprovalState, actor: FinanceActor) {
    return recordApproval(state, toApprovalActor(actor));
  }

  /** Stamps who sent an item back, when and why onto its approval state. */
  rejection(state: ApprovalState, actor: FinanceActor, reason = '') {
    return recordRejection(state, toApprovalActor(actor), reason);
  }
}
