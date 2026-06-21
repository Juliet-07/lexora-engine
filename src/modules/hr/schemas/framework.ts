import { FrameworkItem } from '../schemas';

// ═══════════════════════════════════════════════════════════════
// Verified directly against the real spreadsheet — checked across
// three separate employee sheets and confirmed identical wording in
// every case. This is the DEFAULT seed for the Performance module;
// fully editable afterward.
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_COMPETENCIES: FrameworkItem[] = [
  {
    key: 'job_knowledge',
    title: 'Job Knowledge',
    description:
      'Understands role requirements, processes, SOPs, and technical demands of the position.',
  },
  {
    key: 'quality_of_work',
    title: 'Quality of Work',
    description:
      'Accuracy, thoroughness, and professional standard of all outputs and deliverables.',
  },
  {
    key: 'productivity_efficiency',
    title: 'Productivity & Efficiency',
    description:
      'Volume and timeliness of work relative to expectations; makes good use of available time.',
  },
  {
    key: 'communication_skills',
    title: 'Communication Skills',
    description:
      'Clarity and professionalism of written and verbal communication; active listening.',
  },
  {
    key: 'teamwork_collaboration',
    title: 'Teamwork & Collaboration',
    description:
      'Cooperates constructively with colleagues; contributes positively to team objectives.',
  },
  {
    key: 'problem_solving',
    title: 'Problem Solving',
    description:
      'Identifies issues proactively; proposes practical solutions; follows through to resolution.',
  },
  {
    key: 'initiative_innovation',
    title: 'Initiative & Innovation',
    description:
      'Acts without waiting to be directed; identifies and proposes improvements.',
  },
  {
    key: 'time_management',
    title: 'Time Management',
    description:
      'Meets deadlines consistently; prioritises effectively; punctual and reliable.',
  },
  {
    key: 'leadership',
    title: 'Leadership',
    description:
      'Guides or mentors others; takes ownership of team outcomes where applicable.',
  },
];

export const DEFAULT_VALUES: FrameworkItem[] = [
  {
    key: 'integrity',
    title: 'Integrity',
    description:
      'Acts honestly and ethically at all times; does what is right even without supervision.',
  },
  {
    key: 'accountability',
    title: 'Accountability',
    description:
      'Takes full responsibility for own work and outcomes; does not deflect blame.',
  },
  {
    key: 'customer_focus',
    title: 'Customer Focus',
    description:
      'Keeps internal and external customer needs central to all decisions and actions.',
  },
  {
    key: 'adaptability',
    title: 'Adaptability',
    description:
      'Responds constructively to change, new tasks, and unexpected challenges.',
  },
  {
    key: 'professional_conduct',
    title: 'Professional Conduct',
    description:
      'Maintains respectful, compliant, and appropriate behaviour in all circumstances.',
  },
];

export const DEFAULT_COMPLIANCE_CHECKLIST: { key: string; label: string }[] = [
  { key: 'contract_signed', label: 'Contract signed by company?' },
  { key: 'handbook_received', label: 'Company Handbook received?' },
  { key: 'rights_understood', label: 'Rights & responsibilities understood?' },
  {
    key: 'family_relationship_customer',
    label: 'Family relationship with any customer or supplier?',
  },
  {
    key: 'family_relationship_government',
    label: 'Family relationship with any government or authority?',
  },
  {
    key: 'previous_appraisal_completed',
    label: 'Previous performance appraisal completed?',
  },
];
