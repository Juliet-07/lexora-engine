// Shared event contract for "put something in a director's in-app
// board-portal docket" — deliberately living in common/, not inside
// the board module, so the many feature services that raise it
// (MeetingService, GovernanceCodeService, EsgFrameworkService, and
// the board module's own BoardMessagingService) never need to import
// anything from src/modules/board — only BoardNotificationService
// (which does live there, listening for this event) needs to know
// where the notification itself ends up stored. This is the same
// decoupling @nestjs/event-emitter is already used for elsewhere in
// this codebase (EmployeeService ↔ ProbationService) — the emitting
// services and the module that reacts never import each other.
//
// One generic event + payload, rather than one bespoke interface and
// @OnEvent handler per trigger (TenantNotificationService's own
// pattern) — board-relevant events are spread across several feature
// modules for genuinely different real actions (a meeting notice, a
// chair-review request, a governance-code approval ask, a new
// message), and giving each its own typed event would multiply
// ceremony without adding anything a caller couldn't already get from
// this one shape.
export const BOARD_NOTIFICATION_EVENT = 'board.notification';

export enum BoardNotificationType {
  MEETING = 'Meeting',
  MINUTES = 'Minutes',
  GOVERNANCE_CODE = 'Governance Code',
  ESG = 'ESG',
  MESSAGE = 'Message',
  TRAINING = 'Training',
  GENERAL = 'General',
}

export interface BoardNotificationEvent {
  tenantId: string;
  // Always set — the notification is always stored against the real
  // BoardMember record, since that's the identity every other
  // board-portal feature (directory, skills, messaging) already
  // keys on.
  recipientBoardMemberId: string;
  // The director's own platform login id, when known — used only to
  // target the realtime push (the room a connected browser actually
  // joined). A notification is still created and listed even when
  // this is null (e.g. a director who hasn't completed onboarding
  // and has no portal session open yet); it just won't arrive live.
  recipientUserId?: string | null;
  type: BoardNotificationType;
  title: string;
  description?: string;
  link?: string | null;
}
