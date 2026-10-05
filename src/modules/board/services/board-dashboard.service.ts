import { Injectable } from '@nestjs/common';
import { BoardMemberService } from './board.service';
import {
  GovernanceCodeService,
  MeetingService,
} from 'src/modules/grc/governance/services';
import {
  MeetingStatus,
  NoticeRsvpStatus,
  TrainingType,
} from 'src/modules/grc/governance/schemas';

export type Tone = 'red' | 'amber' | 'blue' | 'violet' | 'green' | 'gray';

export interface AttentionItem {
  id: string;
  kind: 'onboarding' | 'sign' | 'rsvp' | 'ack' | 'pack' | 'code' | 'action';
  title: string;
  subtitle: string;
  tone: Tone;
  pill: string;
  to: string;
}

// Board portal, self-service — the Dashboard page's single data source.
// A leaf service: it composes MeetingService/GovernanceCodeService/
// BoardMemberService (none of which ever inject this back), so there's
// no circular-DI risk the way there would be putting this aggregation
// inside BoardMemberService itself (which both of the other two already
// depend on).
//
// Every number and list here is drawn from real records — no fabricated
// KPI or attention item is included, and nothing here links to a page
// that doesn't yet have a real board-portal implementation (Resolutions,
// Declarations, Evaluations, Board Directory are all still frontend-only
// placeholders in lexora-board as of this round, so nothing surfaced
// here points at them).
@Injectable()
export class BoardDashboardService {
  constructor(
    private readonly boardMemberService: BoardMemberService,
    private readonly meetingService: MeetingService,
    private readonly governanceCodeService: GovernanceCodeService,
  ) {}

  async getForBoardMember(userId: string) {
    const { boardMemberId, tenantId, email } =
      await this.boardMemberService.resolveBoardMember(userId);

    const [profile, onboarding, meetings, pendingCodes] = await Promise.all([
      this.boardMemberService.getMyProfile(userId),
      this.boardMemberService.getMyOnboarding(userId),
      this.meetingService.getForBoardMemberPortal(
        tenantId,
        boardMemberId,
        email,
      ),
      this.governanceCodeService.getPendingForBoardMember(userId),
    ]);

    const now = new Date();
    const currentYear = now.getFullYear();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // ── CPD hours logged this year — real TrainingRecord entries of
    // type CPD only (Mandatory/Certification records aren't "CPD"). ──
    const cpdHoursYTD = (profile.training ?? [])
      .filter(
        (t: any) =>
          t.type === TrainingType.CPD &&
          new Date(t.completedAt).getFullYear() === currentYear,
      )
      .reduce((sum: number, t: any) => sum + (t.hours || 0), 0);

    // ── Documents still to sign (onboarding, Step 3) ────────────────
    const docsToSign = onboarding.stages.documentsCoi.documents ?? [];
    const signedIds: string[] =
      onboarding.stages.documentsCoi.submission?.signedDocumentIds ?? [];
    const documentsToSignRemaining = Math.max(
      0,
      docsToSign.length - signedIds.length,
    );

    // ── Board packs ──────────────────────────────────────────────────
    const packs = (meetings as any[]).filter(
      (m) => (m.boardPack ?? []).length > 0,
    );
    const unreadPacks = packs.filter((m) => !m.myBoardPack.allDocumentsRead);

    // ── Upcoming meetings (today or later) ────────────────────────────
    // Status is deliberately not part of this filter: a postponed
    // meeting's `date` is already updated to its new date when it's
    // postponed (see MeetingService#postponeMeeting), so it belongs in
    // "upcoming" exactly like any other future meeting — excluding
    // Postponed here would just hide it from its own reschedule.
    const upcomingMeetings = (meetings as any[])
      .filter((m) => new Date(m.date).getTime() >= todayStart.getTime())
      .sort((a, b) => +new Date(a.date) - +new Date(b.date));

    // ── Attention items — every real, actionable thing pending ───────
    const attentionItems: AttentionItem[] = [];

    if (
      profile.lifecycleStatus === 'Onboarding' &&
      onboarding.doneItems < onboarding.totalItems
    ) {
      attentionItems.push({
        id: 'onboarding',
        kind: 'onboarding',
        title: 'Continue your onboarding',
        subtitle: `${onboarding.doneItems} of ${onboarding.totalItems} steps complete`,
        tone: 'amber',
        pill: 'In progress',
        to: '/onboarding',
      });
    }

    if (documentsToSignRemaining > 0) {
      attentionItems.push({
        id: 'documents-to-sign',
        kind: 'sign',
        title: `${documentsToSignRemaining} document${documentsToSignRemaining === 1 ? '' : 's'} to sign`,
        subtitle: 'Part of your onboarding — Documents & declarations',
        tone: 'amber',
        pill: 'Sign now',
        to: '/onboarding',
      });
    }

    for (const code of pendingCodes as any[]) {
      if (code.myDecision) continue;
      attentionItems.push({
        id: `code-${code.id}`,
        kind: 'code',
        title: `Review & decide: ${code.title}`,
        subtitle: `${code.category} · awaiting your approval`,
        tone: 'violet',
        pill: 'Decide',
        to: '/governance-codes',
      });
    }

    for (const m of meetings as any[]) {
      if (
        m.notice &&
        m.myNoticeRsvp?.rsvp === NoticeRsvpStatus.PENDING &&
        new Date(m.date).getTime() >= todayStart.getTime()
      ) {
        attentionItems.push({
          id: `rsvp-${m._id}`,
          kind: 'rsvp',
          title: `RSVP: ${m.title}`,
          subtitle: new Date(m.date).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
          }),
          tone: 'amber',
          pill: 'RSVP',
          to: '/meetings',
        });
      }
      if (
        m.status !== MeetingStatus.DRAFT &&
        !m.myAck &&
        new Date(m.date).getTime() >= todayStart.getTime()
      ) {
        attentionItems.push({
          id: `ack-${m._id}`,
          kind: 'ack',
          title: `Acknowledge agenda: ${m.title}`,
          subtitle: new Date(m.date).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
          }),
          tone: 'blue',
          pill: 'Acknowledge',
          to: '/meetings',
        });
      }
      for (const item of m.actionItems ?? []) {
        if (item.status !== 'Open') continue;
        attentionItems.push({
          id: `action-${item._id}`,
          kind: 'action',
          title: item.title,
          subtitle: `Action item · ${m.title}`,
          tone: 'amber',
          pill: 'Open',
          to: '/meetings',
        });
      }
    }

    for (const m of unreadPacks) {
      attentionItems.push({
        id: `pack-${m._id}`,
        kind: 'pack',
        title: `Read board pack: ${m.title}`,
        subtitle: `${m.myBoardPack.readFileUrls.length} of ${m.boardPack.length} documents read`,
        tone: 'blue',
        pill: 'Read',
        to: '/board-packs',
      });
    }

    // Cap the list so a busy director isn't shown an unbounded wall —
    // the count still reflects everything, the list is just trimmed.
    const cappedAttentionItems = attentionItems.slice(0, 10);

    // ── "My standing" — a compliance-flavoured read of the same real
    // items above, grouped the way a director would scan it. ─────────
    const standing = [
      ...(profile.lifecycleStatus === 'Onboarding'
        ? [
            {
              id: 'standing-onboarding',
              label: 'Onboarding',
              status: `${onboarding.doneItems}/${onboarding.totalItems} steps complete`,
              due: '',
              tone: (onboarding.doneItems < onboarding.totalItems
                ? 'amber'
                : 'green') as Tone,
            },
          ]
        : []),
      ...unreadPacks.map((m) => ({
        id: `standing-pack-${m._id}`,
        label: `Board pack — ${m.title}`,
        status: 'Not fully read',
        due: new Date(m.date).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
        }),
        tone: 'amber' as Tone,
      })),
      ...(meetings as any[])
        .filter(
          (m) =>
            m.notice &&
            m.myNoticeRsvp?.rsvp === NoticeRsvpStatus.PENDING &&
            new Date(m.date).getTime() >= todayStart.getTime(),
        )
        .map((m) => ({
          id: `standing-rsvp-${m._id}`,
          label: `Meeting RSVP — ${m.title}`,
          status: 'Pending',
          due: new Date(m.date).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
          }),
          tone: 'amber' as Tone,
        })),
      ...(pendingCodes as any[])
        .filter((c) => !c.myDecision)
        .map((c) => ({
          id: `standing-code-${c.id}`,
          label: `Governance code — ${c.title}`,
          status: 'Awaiting your decision',
          due: '',
          tone: 'violet' as Tone,
        })),
    ].slice(0, 8);

    const nextMeeting = upcomingMeetings[0] ?? null;

    return {
      kpis: {
        pendingActions: attentionItems.length,
        documentsToSign: documentsToSignRemaining,
        boardPacksToRead: unreadPacks.length,
        boardPacksTotal: packs.length,
        nextMeeting: nextMeeting
          ? { title: nextMeeting.title, date: nextMeeting.date }
          : null,
        cpdHoursYTD,
        pendingCodeDecisions: (pendingCodes as any[]).filter(
          (c) => !c.myDecision,
        ).length,
      },
      attentionItems: cappedAttentionItems,
      upcomingMeetings: upcomingMeetings.slice(0, 4).map((m) => ({
        id: m._id,
        date: m.date,
        title: m.title,
        location: m.location,
        mode: m.mode,
        tag:
          m.notice && m.myNoticeRsvp
            ? m.myNoticeRsvp.rsvp
            : m.myAck
              ? 'Acknowledged'
              : 'Awaiting RSVP',
        tagTone: (m.notice && m.myNoticeRsvp
          ? m.myNoticeRsvp.rsvp === NoticeRsvpStatus.CONFIRMED
            ? 'green'
            : m.myNoticeRsvp.rsvp === NoticeRsvpStatus.APOLOGIES
              ? 'gray'
              : 'amber'
          : m.myAck
            ? 'green'
            : 'amber') as Tone,
      })),
      standing,
    };
  }
}
