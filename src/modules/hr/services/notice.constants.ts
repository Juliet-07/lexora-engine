import {
  NoticeAckMethod,
  NoticePriority,
  NoticeReminderCadence,
} from '../schemas';

// Built-in notice templates. Tenants can add their own on top
// (NoticeTemplate collection); these are always present and read-only.
export interface BuiltInNoticeTemplate {
  id: string;
  name: string;
  category: string;
  priority: NoticePriority;
  description: string;
  requireAck: boolean;
  ackMethod: NoticeAckMethod;
  // 'individuals' templates (a PIP) are addressed to one named person.
  audienceHint?: 'individuals';
  body: string;
}

const P = NoticePriority;
const M = NoticeAckMethod;

export const BUILT_IN_NOTICE_TEMPLATES: BuiltInNoticeTemplate[] = [
  {
    id: 'T0',
    name: 'Blank notice',
    category: 'General',
    priority: P.NORMAL,
    description:
      'Start from a blank page for any other communication to staff.',
    requireAck: false,
    ackMethod: M.CLICK,
    body: '',
  },
  {
    id: 'T1',
    name: 'Policy update',
    category: 'Policy',
    priority: P.IMPORTANT,
    description: 'Announce a new or revised policy and collect confirmation.',
    requireAck: true,
    ackMethod: M.CLICK,
    body: '<p>Dear colleagues,</p><p>The [policy name] has been revised and takes effect on [date]. The main changes are:</p><ul><li>[Change one]</li><li>[Change two]</li></ul><p>Please read and review the policy in your employee portal and acknowledge it by [deadline].</p>',
  },
  {
    id: 'T2',
    name: 'Policy attestation',
    category: 'Compliance',
    priority: P.CRITICAL,
    description: 'Annual or regulatory attestation with typed e-signature.',
    requireAck: true,
    ackMethod: M.SIGNATURE,
    body: '<p>Dear colleagues,</p><p>As part of our regulatory obligations, every member of staff must attest each year that they have read and will comply with the [policy name].</p><p>Please read and review the policy in your employee portal and acknowledge it by signing this attestation by [deadline].</p>',
  },
  {
    id: 'T3',
    name: 'Statutory change',
    category: 'Statutory',
    priority: P.IMPORTANT,
    description:
      'Changes to statutory contributions, deductions or employment law requirements.',
    requireAck: false,
    ackMethod: M.CLICK,
    body: '<p>Dear colleagues,</p><p>From [date], [describe the change]. Your payslip will show [what changes].</p><p>Contact Finance with any questions.</p>',
  },
  {
    id: 'T4',
    name: 'Office closure',
    category: 'Office and Facilities',
    priority: P.NORMAL,
    description: 'Public holidays, Umuganda, relocations and closures.',
    requireAck: false,
    ackMethod: M.CLICK,
    body: '<p>Dear colleagues,</p><p>The [office] will be closed on [date] for [reason]. [Arrangements for client emergencies].</p>',
  },
  {
    id: 'T5',
    name: 'Health and safety drill',
    category: 'Health and Safety',
    priority: P.IMPORTANT,
    description: 'Fire drills, evacuation exercises and safety briefings.',
    requireAck: true,
    ackMethod: M.CLICK,
    body: '<p>Dear colleagues,</p><p>A [type of drill] will take place at [location] on [date and time]. When the alarm sounds, [instructions].</p><p>Please acknowledge that you know your nearest exit and assembly point.</p>',
  },
  {
    id: 'T6',
    name: 'Security alert',
    category: 'IT and Security',
    priority: P.CRITICAL,
    description: 'Urgent warnings about phishing, fraud or system incidents.',
    requireAck: true,
    ackMethod: M.CLICK,
    body: '<p>Dear colleagues,</p><p>We are aware of [describe the threat]. Please do not [action to avoid].</p><p>Report anything suspicious to Technology through the Service Desk.</p>',
  },
  {
    id: 'T7',
    name: 'Welcome announcement',
    category: 'Announcement',
    priority: P.NORMAL,
    description: 'Introduce new joiners and leadership appointments.',
    requireAck: false,
    ackMethod: M.CLICK,
    body: '<p>Dear colleagues,</p><p>Please join us in welcoming [name], who joins us as [role] in [team].</p>',
  },
  {
    id: 'T8',
    name: 'Event invitation',
    category: 'Events',
    priority: P.NORMAL,
    description: 'Staff events and town halls with RSVP details.',
    requireAck: false,
    ackMethod: M.CLICK,
    body: '<p>You are invited to [event] on [date] at [venue]. Please confirm your attendance by [date].</p>',
  },
  {
    id: 'T9',
    name: 'Performance improvement plan (PIP)',
    category: 'Performance',
    priority: P.IMPORTANT,
    description:
      'Issue a PIP to one employee for review and signed acknowledgement. Visible only to the employee and HR.',
    requireAck: true,
    ackMethod: M.SIGNATURE,
    audienceHint: 'individuals',
    body: '<p>Dear {{first_name}},</p><p>Following our discussion on [date], this notice sets out your Performance Improvement Plan. The plan runs from [start date] to [end date].</p><h2>Areas for improvement</h2><ul><li>[Performance concern and the standard expected]</li><li>[Performance concern and the standard expected]</li></ul><h2>Support provided</h2><ul><li>[Training, coaching or resources]</li><li>[Frequency of check-in meetings with your line manager]</li></ul><h2>Review</h2><p>Progress will be reviewed on [review dates]. If the required standard is not met by the end of the plan, further action may be taken in line with the Disciplinary Policy.</p><p>Please read and review this plan in your employee portal and acknowledge it by signing below. Your acknowledgement confirms that you have received and read the plan. It does not mean that you agree with its contents. You may raise any comments by asking a question on this notice.</p><p>[Line manager name]<br>[Role]</p>',
  },
  {
    id: 'T10',
    name: 'Training',
    category: 'Training',
    priority: P.IMPORTANT,
    description:
      'Mandatory or optional training sessions, with attendance requirements and pre-reading.',
    requireAck: true,
    ackMethod: M.CLICK,
    body: '<p>Dear colleagues,</p><p>You are required to attend [training name] on [date] from [time] at [venue or online link].</p><ul><li>Who must attend: [teams or roles]</li><li>Facilitator: [name]</li><li>Preparation: [pre-reading or tasks]</li></ul><p>Attendance will be recorded in Learning and Development. Please read and review this notice in your employee portal and acknowledge it to confirm that you will attend.</p>',
  },
];

export const DEFAULT_NOTICE_FOOTER =
  'Contact People and Culture with any questions about this notice.';

export const DEFAULT_NOTICE_SETTINGS = {
  senderName: '',
  emailChannel: true,
  reminders: NoticeReminderCadence.EVERY_2_DAYS,
  escalateAfter: 3,
  quietFrom: '19:00',
  quietTo: '07:00',
  reAck: true,
  retention: 7,
  footer: DEFAULT_NOTICE_FOOTER,
  questions: true,
  readReceipts: true,
};

// Cadence → minimum hours between reminders to the same person.
export const REMINDER_INTERVAL_HOURS: Record<string, number> = {
  daily: 24,
  every2: 48,
  weekly: 168,
};

// "New joiners" audience window.
export const NEW_JOINER_DAYS = 90;
