// Defaults put in place the first time a tenant opens Stakeholder
// Communications. Everything here is editable or removable afterwards.

export interface SeedGroup {
  key: string;
  name: string;
  icon: string;
  color: string;
  slaHours: number | null;
  reactive?: boolean;
  statutory?: string;
  channel: string;
  approvalMinLevel: number;
  source?: 'contacts' | 'crm_clients';
  trigger: { minLevel?: number; types?: string[]; flags?: string[] };
  // Routes that do not depend on a named person. People (board
  // members, insurers' claims desks, ...) are never invented: the
  // tenant adds their own.
  contacts: { name: string; role: string; email: string; phone?: string }[];
}

export const SEED_GROUPS: SeedGroup[] = [
  {
    key: 'board',
    name: 'Board Chair and Audit Committee',
    icon: 'landmark',
    color: '#3b36db',
    slaHours: 1,
    channel: 'Secure email and call',
    approvalMinLevel: 3,
    trigger: { minLevel: 3 },
    contacts: [],
  },
  {
    key: 'ncsa',
    name: 'Data protection regulator (NCSA)',
    icon: 'shield-alert',
    color: '#c62828',
    slaHours: 24,
    statutory: 'Statutory limit is 48 hours from becoming aware of the breach',
    channel: 'Formal letter and regulator portal',
    approvalMinLevel: 1,
    trigger: { types: ['Data breach'] },
    contacts: [
      {
        name: 'Data Protection and Privacy Office',
        role: 'Supervisory authority',
        email: 'Submitted through the NCSA portal',
      },
    ],
  },
  {
    key: 'bnr',
    name: 'Licensing regulator (BNR)',
    icon: 'scale',
    color: '#0e7490',
    slaHours: 24,
    channel: 'Formal letter and supervisory portal',
    approvalMinLevel: 1,
    trigger: { minLevel: 3, types: ['Fraud', 'Regulatory breach'] },
    contacts: [
      {
        name: 'Assigned supervisor',
        role: 'Supervision Department',
        email: 'Formal letter to the supervisor on record',
      },
    ],
  },
  {
    key: 'clients',
    name: 'Affected clients',
    icon: 'briefcase-business',
    color: '#047857',
    slaHours: 48,
    channel: 'Personalised email from the spokesperson',
    approvalMinLevel: 1,
    source: 'crm_clients',
    trigger: { flags: ['clientImpact'] },
    contacts: [],
  },
  {
    key: 'media',
    name: 'Media and public',
    icon: 'newspaper',
    color: '#be185d',
    slaHours: null,
    reactive: true,
    channel: 'Prepared statement, single spokesperson',
    approvalMinLevel: 1,
    trigger: { minLevel: 4, flags: ['mediaInterest'] },
    contacts: [
      {
        name: 'Spokesperson',
        role: 'Sole authorised spokesperson',
        email: 'All enquiries routed to the spokesperson',
      },
    ],
  },
  {
    key: 'insurer',
    name: 'Insurance provider',
    icon: 'umbrella',
    color: '#b45309',
    slaHours: 72,
    channel: 'Formal claim notification',
    approvalMinLevel: 1,
    trigger: { minLevel: 3, types: ['Data breach', 'Cyber attack'] },
    contacts: [],
  },
];

export interface SeedTemplate {
  key: string;
  name: string;
  groupKey: string | null; // null = any stakeholder
  description: string;
  subject: string;
  body: string;
}

export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    key: 'outage-clients',
    name: 'System outage notice',
    groupKey: 'clients',
    description: 'Scheduled or unscheduled downtime affecting client services',
    subject: 'Service disruption: {{incident_title}}',
    body: `Dear {{client_name}},

We are writing to inform you that since {{declared_at}} some of our services have been unavailable.

What happened: {{impact_summary}}

What this means for you: [describe the effect on the client's matters, filings or deadlines].

What we are doing: our technology team is working to restore full service, and we have put manual arrangements in place for urgent matters.

We will send you a further update by {{next_update}}. In the meantime, please contact your relationship manager directly for anything urgent.

Yours sincerely,
{{spokesperson}}
{{company}}`,
  },
  {
    key: 'breach-clients',
    name: 'Data breach notification: clients',
    groupKey: 'clients',
    description:
      'Notice to clients whose personal data may be affected, in line with the data protection law',
    subject:
      'Important: information about your personal data ({{incident_ref}})',
    body: `Dear {{client_name}},

We are writing to let you know about an incident that may affect personal data we hold for you.

On {{declared_at}} we identified {{impact_summary}}. We contained the incident and notified the data protection regulator.

The information involved may include: [categories of personal data].

What we are doing: [containment and investigation steps].

What you can do: [practical steps, for example watching for unexpected requests for documents or payments].

If you have questions, contact our Data Protection Officer at [contact details].

We sincerely regret this incident and the concern it may cause.

Yours sincerely,
{{spokesperson}}
{{company}}`,
  },
  {
    key: 'breach-regulator',
    name: 'Data breach notification: regulator',
    groupKey: 'ncsa',
    description:
      'Formal notification of a personal data breach to the supervisory authority',
    subject:
      'Notification of personal data breach: {{company}}, {{incident_ref}}',
    body: `To: Data Protection and Privacy Office, National Cyber Security Authority

Notification of a personal data breach

1. Controller: {{company}}
2. Date and time the breach was identified: {{declared_at}}
3. Nature of the breach: {{impact_summary}}
4. Categories and approximate number of data subjects: [number] clients and [number] records
5. Likely consequences: [assessment]
6. Measures taken or proposed: [containment, investigation, notification of data subjects]
7. Contact: Data Protection Officer, [contact details]

We will provide further information as our investigation progresses.

{{spokesperson}}
{{company}}`,
  },
  {
    key: 'regulator-report',
    name: 'Regulator incident report',
    groupKey: 'bnr',
    description: 'Formal notification to the licensing supervisor',
    subject: 'Incident notification: {{incident_ref}}, {{incident_title}}',
    body: `The Director, Supervision Department

Re: Notification of a material incident

We notify the Bank of an incident declared at {{declared_at}} and classified as {{level}}.

Summary: {{impact_summary}}

Impact on licensed activities: [effect on client services, records and obligations]

Actions taken: [containment, recovery, communications]

Next report: we will provide an update by {{next_update}} and a full incident report within [period].

Yours faithfully,
{{spokesperson}}
{{company}}`,
  },
  {
    key: 'board-briefing',
    name: 'Board incident briefing',
    groupKey: 'board',
    description: 'Initial briefing to the Board Chair and Audit Committee',
    subject: 'Board briefing: {{incident_ref}} declared, {{level}}',
    body: `Dear Chair and members of the Audit Committee,

At {{declared_at}} we declared incident {{incident_ref}} ({{level}}).

Summary: {{impact_summary}}

Current position: the Crisis Management Team has convened and is managing the response.

Stakeholder notifications planned: regulators, affected clients and our insurer, in line with the crisis communications plan.

Decisions needed from the Board: [if any]

Next briefing: by {{next_update}}, or sooner if the position changes materially.

{{spokesperson}}
{{company}}`,
  },
  {
    key: 'media-holding',
    name: 'Media holding statement',
    groupKey: 'media',
    description: 'Reactive statement for enquiries during an active incident',
    subject: 'Holding statement: {{incident_ref}}',
    body: `{{company}} is aware of {{impact_summary_short}}. We acted immediately to contain it and are working with the relevant authorities.

Protecting our clients and their information is our priority. We are contacting any affected clients directly.

We will share further information when it is appropriate to do so. All enquiries should be directed to the {{spokesperson}}.`,
  },
  {
    key: 'insurer-claim',
    name: 'Insurer claim notification',
    groupKey: 'insurer',
    description: 'Formal notice of a potential claim under the policy',
    subject: 'Notice of circumstances and potential claim: {{incident_ref}}',
    body: `To: Claims Department

Policy number: [policy number]
Insured: {{company}}

We give notice of circumstances that may give rise to a claim. An incident was declared at {{declared_at}}.

Description: {{impact_summary}}

Estimated impact: [costs incurred, business interruption, third-party exposure]

Actions taken: [containment and response]

Please confirm receipt and advise on the next steps, including any approved panel providers.

{{spokesperson}}
{{company}}`,
  },
  {
    key: 'progress-update',
    name: 'Stakeholder progress update',
    groupKey: null,
    description:
      'Follow-up update to any stakeholder group while the incident is open',
    subject: 'Update on {{incident_ref}}: {{incident_title}}',
    body: `Dear [recipient],

Further to our earlier communication, here is an update on {{incident_title}}.

Progress since our last update: [what has changed]

Current status: [service status and containment]

Next steps: [what happens next]

We will provide a further update by {{next_update}}.

{{spokesperson}}
{{company}}`,
  },
  {
    key: 'post-incident-review',
    name: 'Post-incident review',
    groupKey: null,
    description:
      'Lessons-learned summary for the Board or regulator after closure',
    subject: 'Post-incident review: {{incident_ref}}',
    body: `Post-incident review: {{incident_ref}}, {{incident_title}}

1. Summary of the incident: {{impact_summary}}
2. Timeline: declared {{declared_at}}, closed [date and time]
3. Root cause: [cause]
4. Impact: [clients, data, financial, regulatory]
5. Stakeholder communications: [who was notified, when, and whether deadlines were met]
6. What worked well: [points]
7. Improvements and owners: [actions, owners, due dates]

{{spokesperson}}
{{company}}`,
  },
];

// Fields a template can use. Filled in from the incident record.
export const MERGE_FIELDS: [string, string][] = [
  ['incident_ref', 'Incident reference'],
  ['incident_title', 'Incident title'],
  ['declared_at', 'Declared at'],
  ['level', 'Level'],
  ['impact_summary', 'What happened'],
  ['next_update', 'Next update time'],
  ['company', 'Company name'],
  ['spokesperson', 'Spokesperson'],
  ['client_name', 'Recipient name'],
];

export const LEVEL_LABELS: Record<number, { label: string; desc: string }> = {
  1: { label: 'Operational', desc: 'Minor disruption, under 1 hour' },
  2: { label: 'Significant', desc: 'Service degradation, 1 to 4 hours' },
  3: { label: 'Critical', desc: 'Major outage, over 4 hours' },
  4: {
    label: 'Catastrophic',
    desc: 'Existential threat, regulator or media',
  },
};
