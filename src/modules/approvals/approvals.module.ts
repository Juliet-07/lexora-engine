import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/modules/auth/schemas/user.schema';
import {
  ApprovalWorkflow,
  ApprovalWorkflowSchema,
} from './schemas/approval.schema';
import { ApprovalWorkflowService } from './services/approval-workflow.service';
import { ApprovalWorkflowController } from './controllers/approval-workflow.controller';
import { WorkflowDrafterGuard } from './guards/workflow-drafter.guard';

// Shared by CRM contracts and GRC deal contracts: who drafts, who reviews
// and approves, the chain copied onto each item, and the guard that keeps
// non-drafters read-only.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ApprovalWorkflow.name, schema: ApprovalWorkflowSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ApprovalWorkflowController],
  providers: [ApprovalWorkflowService, WorkflowDrafterGuard],
  exports: [ApprovalWorkflowService, WorkflowDrafterGuard],
})
export class ApprovalsModule {}
