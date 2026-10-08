import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GovernanceModule } from 'src/modules/grc/governance/governance.module';
import {
  BoardMember,
  BoardMemberSchema,
} from 'src/modules/grc/governance/schemas';
import { BoardPortalController } from './board.controller';
import {
  BoardDashboardService,
  BoardMessagingService,
  BoardNotificationService,
} from './services';
import {
  BoardMessage,
  BoardMessageSchema,
  BoardNotification,
  BoardNotificationSchema,
} from './schemas';
import { EsgModule } from '../grc/esg/esg.module';

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
// Messaging and notifications (Oct 2026) are the first genuinely new,
// board-portal-exclusive data this module owns outright — unlike
// everything above, neither belongs to Governance or ESG, so
// registering their schemas directly here (rather than inventing a
// home for them in a feature module that doesn't otherwise want them)
// is the right exception to "this module owns no schemas of its own":
// that rule was about not duplicating domain data that already has a
// real owner elsewhere, and board messages/notifications never had
// one. BoardMember is also registered here (direct model injection,
// not a second BoardMemberService import) purely so
// BoardMessagingService can look up a counterpart's name/tenant/
// userId without a circular service dependency — the same
// direct-model-injection convention already used throughout this
// codebase for cross-module reads.
@Module({
  imports: [
    GovernanceModule,
    EsgModule,
    MongooseModule.forFeature([
      { name: BoardMember.name, schema: BoardMemberSchema },
      { name: BoardMessage.name, schema: BoardMessageSchema },
      { name: BoardNotification.name, schema: BoardNotificationSchema },
    ]),
  ],
  providers: [
    BoardDashboardService,
    BoardMessagingService,
    BoardNotificationService,
  ],
  controllers: [BoardPortalController],
})
export class BoardPortalModule {}
