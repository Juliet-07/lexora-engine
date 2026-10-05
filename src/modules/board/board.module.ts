import { Module } from '@nestjs/common';
import { GovernanceModule } from 'src/modules/grc/governance/governance.module';
import { BoardPortalController } from './board.controller';
import { EsgFrameworkService } from '../grc/esg/services';
import {
  BoardMemberService,
  BoardTrainingService,
  GovernanceCodeService,
  MeetingService,
} from '../grc/governance/services';
import { BoardDashboardService } from './services';

// Every endpoint a signed-in board member (UserType.BOARD_MEMBER) calls
// from their own portal (lexora-board) lives here, in one place —
// instead of one extra controller bolted onto whichever feature module
// happens to own the data, the way it was before.
//
// This module owns NO schemas or services of its own. It only imports
// the feature modules that already own board-relevant data (Governance
// today — board members, committees, meetings, governance codes,
// trainings) and injects their real, exported services into its
// controllers. That's a deliberate, one-directional dependency:
// GovernanceModule has no import back to BoardPortalModule, so there's
// no cycle. As more domains grow a board-facing slice (ESG disclosure
// sign-off, for instance), they join the same way: import that
// module here, export the service(s) it needs from there if not
// already exported, and add its own controller to `controllers/`
// below — never copy its schema/service code into this folder, which
// is what broke the first attempt at this (duplicate, un-wired files
// under src/modules/board/ with relative imports left pointing at
// their old location).
@Module({
  imports: [GovernanceModule],
  providers: [
    BoardDashboardService,
    EsgFrameworkService,
    MeetingService,
    BoardMemberService,
    GovernanceCodeService,
    BoardTrainingService,
  ],
  controllers: [BoardPortalController],
})
export class BoardPortalModule {}
