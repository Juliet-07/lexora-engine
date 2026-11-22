import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from 'src/common/decorators';
import { ApprovalModuleKey } from '../schemas/approval.schema';
import { ApprovalWorkflowService } from '../services/approval-workflow.service';

export const WORKFLOW_MODULE_KEY = 'approvalWorkflowModule';
export const ALLOW_WITHOUT_DRAFTER_KEY = 'approvalAllowWithoutDrafter';

/**
 * Put on a controller whose items go through an approval chain.
 *  - The account owner is never held back.
 *  - An employee is let in only if the owner has put them in the chain
 *    (as a drafter, reviewer or approver); everyone else is turned away.
 *  - Within the chain, only drafters can change things. Reviewers and
 *    approvers can read, and decide the step that is theirs.
 */
export const WorkflowModule = (key: ApprovalModuleKey) =>
  SetMetadata(WORKFLOW_MODULE_KEY, { key });

/** A write route anyone on the chain may call (e.g. a reviewer's decision) — the service decides who. */
export const AllowWithoutDrafter = () =>
  SetMetadata(ALLOW_WITHOUT_DRAFTER_KEY, true);

@Injectable()
export class WorkflowDrafterGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly workflows: ApprovalWorkflowService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;
    const cfg = this.reflector.getAllAndOverride<{ key: ApprovalModuleKey }>(
      WORKFLOW_MODULE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!cfg) return true;
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException('Access denied');
    if (ApprovalWorkflowService.isOwner(user)) return true;

    const role = await this.workflows.role(user, cfg.key);
    if (!role.onChain)
      throw new ForbiddenException(
        'The account owner has not added you to this approval chain, so you cannot open this yet.',
      );
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    const open = this.reflector.getAllAndOverride<boolean>(
      ALLOW_WITHOUT_DRAFTER_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (open || role.drafter) return true;
    throw new ForbiddenException(
      'You can view this, but only a drafter set up by the account owner can make changes.',
    );
  }
}
