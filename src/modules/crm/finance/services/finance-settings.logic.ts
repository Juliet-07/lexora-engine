import { BadRequestException } from '@nestjs/common';
import {
  FINANCE_SETTINGS_DEFAULTS,
  SETTINGS_SECTIONS,
  SettingsSection,
} from '../schemas/finance-settings.schema';
import {
  BODY_FONTS,
  HEADING_FONTS,
} from '../../../../common/utils/pdf/branding.util';

// Pure helpers behind FinanceSettingsService: merging with defaults,
// validating a section patch, and turning a before/after pair into the
// plain-language lines the Change Log shows.

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const isObj = (v: any) => v && typeof v === 'object' && !Array.isArray(v);

export const isSection = (s: string): s is SettingsSection =>
  (SETTINGS_SECTIONS as readonly string[]).includes(s);

export const defaultsFor = (section: SettingsSection) =>
  clone(FINANCE_SETTINGS_DEFAULTS[section]) as Record<string, any>;

// Objects merge key by key; arrays and scalars are replaced whole.
export const deepMerge = (base: any, over: any): any => {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out: Record<string, any> = { ...base };
  for (const k of Object.keys(over)) {
    out[k] = isObj(base[k]) && isObj(over[k]) ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
};

export const mergeWithDefaults = (section: SettingsSection, stored: any) =>
  deepMerge(defaultsFor(section), stored ?? {});

// ── Field checks ──────────────────────────────────────────────

const bad = (msg: string): never => {
  throw new BadRequestException(msg);
};
const oneOf = (v: any, allowed: readonly string[], label: string) => {
  if (!allowed.includes(v)) bad(`${label} is not one of: ${allowed.join(', ')}.`);
  return v as string;
};
const num = (v: any, label: string, min: number, max: number) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || Number.isNaN(n) || n < min || n > max)
    bad(`${label} has to be a number between ${min} and ${max}.`);
  return n as number;
};
const nullableNum = (v: any, label: string, min: number, max: number) =>
  v === null || v === '' || v === undefined ? null : num(v, label, min, max);
const bool = (v: any, label: string) => {
  if (typeof v !== 'boolean') bad(`${label} has to be on or off.`);
  return v as boolean;
};
const str = (v: any, label: string, max: number) => {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') bad(`${label} has to be text.`);
  const t = (v as string).trim();
  if (t.length > max) bad(`${label} can be at most ${max} characters.`);
  return t;
};
const hex = (v: any, label: string) => {
  if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v))
    bad(`${label} has to be a colour like #1B2A4A.`);
  return (v as string).toUpperCase();
};

// Applies `patch` over `cur`, key by key, using the check for each key;
// keys that are not part of the section are ignored.
const apply = (
  cur: Record<string, any>,
  patch: Record<string, any>,
  checks: Record<string, (v: any) => any>,
) => {
  const out = { ...cur };
  for (const k of Object.keys(checks)) {
    if (patch && patch[k] !== undefined) out[k] = checks[k](patch[k]);
  }
  return out;
};
const nested = (
  cur: Record<string, any>,
  patch: any,
  checks: Record<string, (v: any) => any>,
) => (isObj(patch) ? apply(cur, patch, checks) : cur);

const NUMBER_FORMATS = ['comma-dot', 'dot-comma', 'space-dot'];
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'DD MMM YYYY', 'YYYY-MM-DD'];
const TERMS = ['due-on-receipt', 'net-7', 'net-14', 'net-30', 'net-45', 'net-60', 'net-90'];

export const PAYMENT_TERM_DAYS: Record<string, number> = {
  'due-on-receipt': 0,
  'net-7': 7,
  'net-14': 14,
  'net-30': 30,
  'net-45': 45,
  'net-60': 60,
  'net-90': 90,
};

// ── Section sanitisers ────────────────────────────────────────

const sanitizers: Record<SettingsSection, (cur: any, patch: any) => any> = {
  general: (cur, p) => {
    const out = apply(cur, p, {
      numberFormat: (v) => oneOf(v, NUMBER_FORMATS, 'Number format'),
      dateFormat: (v) => oneOf(v, DATE_FORMATS, 'Date format'),
      multiCurrency: (v) => bool(v, 'Multi-currency mode'),
      fiscalYearStartMonth: (v) => num(v, 'Fiscal year start', 1, 12),
      reportingPeriods: (v) =>
        oneOf(v, ['monthly', 'quarterly', 'bi-annually'], 'Reporting periods'),
      lockClosedPeriods: (v) => bool(v, 'Lock closed periods'),
      autoClosePeriods: (v) => bool(v, 'Auto-close periods'),
      exchangeRateSource: (v) =>
        oneOf(v, ['central-bank', 'manual', 'commercial'], 'Exchange rate source'),
      autoSyncRates: (v) => bool(v, 'Auto-sync exchange rates'),
    });
    out.defaultAccounts = nested(cur.defaultAccounts ?? {}, p?.defaultAccounts, {
      revenue: (v) => str(v, 'Revenue account', 40),
      receivable: (v) => str(v, 'Receivables account', 40),
      payable: (v) => str(v, 'Payables account', 40),
      bank: (v) => str(v, 'Bank account', 40),
      retainedEarnings: (v) => str(v, 'Retained earnings account', 40),
    });
    out.asset = nested(cur.asset ?? {}, p?.asset, {
      depreciationMethod: (v) =>
        oneOf(v, ['straight-line', 'reducing-balance', 'units-of-production'], 'Depreciation method'),
      capitalisationThreshold: (v) => num(v, 'Capitalisation threshold', 0, 1e12),
      trackInsuranceExpiry: (v) => bool(v, 'Track insurance expiry'),
    });
    out.trust = nested(cur.trust ?? {}, p?.trust, {
      interestTreatment: (v) =>
        oneOf(v, ['firm-retained', 'credited-to-client', 'split'], 'Interest treatment'),
      requireDrawdownApproval: (v) => bool(v, 'Require drawdown approval'),
      autoReconcile: (v) => bool(v, 'Auto-reconcile trust accounts'),
    });
    return out;
  },

  tax: (cur, p) => {
    const out = apply(cur, p, {
      jurisdiction: (v) => {
        const s = str(v, 'Tax jurisdiction', 6).toLowerCase();
        if (!s) bad('Pick a tax jurisdiction.');
        return s;
      },
      tin: (v) => str(v, 'Tax identification number', 40),
      standardVatRate: (v) => num(v, 'Standard VAT rate', 0, 100),
      vatRegistered: (v) => bool(v, 'VAT registered'),
      autoCalculateVat: (v) => bool(v, 'Auto-calculate VAT'),
    });
    if (p?.categories !== undefined) {
      if (!Array.isArray(p.categories)) bad('Tax categories have to be a list.');
      const seen = new Set<string>();
      out.categories = p.categories.map((c: any) => {
        const code = str(c?.code, 'Category code', 10).toUpperCase();
        if (!code) bad('Every tax category needs a code.');
        if (seen.has(code)) bad(`Tax category code ${code} is used twice.`);
        seen.add(code);
        const name = str(c?.name, 'Category name', 80);
        if (!name) bad(`Tax category ${code} needs a name.`);
        return {
          code,
          name,
          rate: nullableNum(c?.rate, `Rate for ${code}`, 0, 100),
          active: c?.active === undefined ? true : bool(c.active, 'Active'),
        };
      });
    }
    if (p?.whtCategories !== undefined) {
      if (!Array.isArray(p.whtCategories))
        bad('Withholding categories have to be a list.');
      const seen = new Set<string>();
      out.whtCategories = p.whtCategories.map((c: any) => {
        const name = str(c?.name, 'Withholding category', 120);
        if (!name) bad('Every withholding category needs a name.');
        if (seen.has(name.toLowerCase()))
          bad(`Withholding category "${name}" is listed twice.`);
        seen.add(name.toLowerCase());
        return { name, rate: num(c?.rate, `Rate for ${name}`, 0, 100) };
      });
    }
    out.reminders = nested(cur.reminders ?? {}, p?.reminders, {
      vat: (v) => bool(v, 'VAT return reminder'),
      paye: (v) => bool(v, 'PAYE return reminder'),
      cit: (v) => bool(v, 'Annual CIT return reminder'),
      pension: (v) => bool(v, 'Pension contribution reminder'),
    });
    return out;
  },

  invoicing: (cur, p) => {
    const out = apply(cur, p, {
      defaultPaymentTerms: (v) => oneOf(v, TERMS, 'Payment terms'),
      lateInterestRate: (v) => num(v, 'Late payment interest rate', 0, 100),
      applyLateFees: (v) => bool(v, 'Apply late fees automatically'),
      invoiceFooter: (v) => str(v, 'Invoice footer', 1000),
      creditNoteFooter: (v) => str(v, 'Credit note footer', 1000),
    });
    out.earlyPaymentDiscount = nested(cur.earlyPaymentDiscount ?? {}, p?.earlyPaymentDiscount, {
      enabled: (v) => bool(v, 'Early payment discount'),
      percent: (v) => num(v, 'Early payment discount percent', 0, 100),
      days: (v) => num(v, 'Early payment discount days', 1, 365),
    });
    out.dunning = nested(cur.dunning ?? {}, p?.dunning, {
      enabled: (v) => bool(v, 'Auto-dunning'),
      firstReminderDays: (v) => num(v, 'First reminder', 0, 365),
      secondReminderDays: (v) => num(v, 'Second reminder', 0, 365),
      finalNoticeDays: (v) => num(v, 'Final notice', 0, 365),
    });
    const d = out.dunning;
    if (!(d.firstReminderDays < d.secondReminderDays && d.secondReminderDays < d.finalNoticeDays))
      bad('Reminders have to escalate: first, then second, then the final notice.');
    return out;
  },

  approvals: (cur, p) => {
    const out = { ...cur };
    if (p?.tiers !== undefined) {
      if (!Array.isArray(p.tiers)) bad('Approval tiers have to be a list.');
      let ids = 0;
      const tiers = p.tiers.map((t: any, i: number) => {
        const name = str(t?.name, 'Tier name', 80) || `Tier ${i + 1}`;
        const min = num(t?.min ?? 0, `Minimum for ${name}`, 0, 1e12);
        const max = nullableNum(t?.max, `Maximum for ${name}`, 0, 1e12);
        if (max !== null && max <= min)
          bad(`${name}: the maximum has to be above the minimum.`);
        const approverIds = Array.isArray(t?.approverIds)
          ? t.approverIds.map((x: any) => str(x, 'Approver', 40)).filter(Boolean)
          : [];
        const mode = oneOf(t?.mode ?? 'single', ['single', 'dual'], 'Approval mode');
        if (mode === 'dual' && approverIds.length && approverIds.length < 2)
          bad(`${name} needs two approvers for dual approval.`);
        ids += 1;
        return {
          id: str(t?.id, 'Tier id', 40) || `tier-${ids}`,
          name,
          min,
          max,
          mode,
          approverIds,
          backupId: str(t?.backupId, 'Backup approver', 40),
          note: str(t?.note, 'Tier note', 240),
        };
      });
      const sorted = [...tiers].sort((a, b) => a.min - b.min);
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        if (prev.max === null || prev.max > sorted[i].min)
          bad(`${prev.name} and ${sorted[i].name} overlap.`);
      }
      out.tiers = sorted;
    }
    if (p?.expenseLimits !== undefined) {
      if (!Array.isArray(p.expenseLimits)) bad('Expense limits have to be a list.');
      const seen = new Set<string>();
      out.expenseLimits = p.expenseLimits.map((l: any) => {
        const role = str(l?.role, 'Role', 60);
        if (!role) bad('Every expense limit needs a role.');
        if (seen.has(role.toLowerCase())) bad(`${role} has two expense limits.`);
        seen.add(role.toLowerCase());
        return { role, monthlyLimit: nullableNum(l?.monthlyLimit, `Limit for ${role}`, 0, 1e12) };
      });
    }
    out.rules = nested(cur.rules ?? {}, p?.rules, {
      selfApprovalRestriction: (v) => bool(v, 'Self-approval restriction'),
      receiptRequired: (v) => bool(v, 'Receipt required above threshold'),
      receiptThreshold: (v) => num(v, 'Receipt threshold', 0, 1e12),
      budgetCheck: (v) => bool(v, 'Budget check before approval'),
      escalateOnTimeout: (v) => bool(v, 'Escalation on timeout'),
      escalationHours: (v) => num(v, 'Escalation timeout', 1, 720),
    });
    return out;
  },

  banking: (cur, p) =>
    apply(cur, p, {
      matchingTolerance: (v) => num(v, 'Matching tolerance', 0, 1e9),
      autoMatchByReference: (v) => bool(v, 'Auto-match by reference'),
      suggestRules: (v) => bool(v, 'Suggest rules from patterns'),
      flagUnmatched: (v) => bool(v, 'Flag unmatched'),
      flagUnmatchedAfterDays: (v) => num(v, 'Flag unmatched after', 1, 365),
    }),

  branding: (cur, p) =>
    apply(cur, p, {
      headerColor: (v) => hex(v, 'Header colour'),
      accentColor: (v) => hex(v, 'Accent colour'),
      highlightColor: (v) => hex(v, 'Highlight colour'),
      companyName: (v) => str(v, 'Company name', 120),
      tagline: (v) => str(v, 'Tagline', 160),
      address: (v) => str(v, 'Address', 300),
      headingFont: (v) => oneOf(v, HEADING_FONTS, 'Heading font'),
      bodyFont: (v) => oneOf(v, BODY_FONTS, 'Body font'),
      showLogo: (v) => bool(v, 'Show logo'),
      showTagline: (v) => bool(v, 'Show tagline'),
      footerWithAddressAndTin: (v) => bool(v, 'Footer with address and TIN'),
      watermarkDrafts: (v) => bool(v, 'Watermark on drafts'),
    }),
};

export const sanitizeSection = (
  section: SettingsSection,
  current: any,
  patch: any,
) => {
  if (!isObj(patch)) bad('Send the settings to change as an object.');
  return sanitizers[section](mergeWithDefaults(section, current), patch);
};

// ── Change log wording ────────────────────────────────────────

const LABELS: Record<string, string> = {
  numberFormat: 'number format',
  dateFormat: 'date format',
  multiCurrency: 'multi-currency mode',
  fiscalYearStartMonth: 'fiscal year start month',
  reportingPeriods: 'reporting periods',
  lockClosedPeriods: 'locking of closed periods',
  autoClosePeriods: 'auto-closing of periods',
  exchangeRateSource: 'exchange rate source',
  autoSyncRates: 'exchange rate auto-sync',
  'defaultAccounts.revenue': 'default revenue account',
  'defaultAccounts.receivable': 'receivables account',
  'defaultAccounts.payable': 'payables account',
  'defaultAccounts.bank': 'default bank account',
  'defaultAccounts.retainedEarnings': 'retained earnings account',
  'asset.depreciationMethod': 'depreciation method',
  'asset.capitalisationThreshold': 'capitalisation threshold',
  'asset.trackInsuranceExpiry': 'insurance expiry tracking',
  'trust.interestTreatment': 'trust interest treatment',
  'trust.requireDrawdownApproval': 'trust drawdown approval',
  'trust.autoReconcile': 'trust auto-reconciliation',
  jurisdiction: 'tax jurisdiction',
  tin: 'tax identification number',
  standardVatRate: 'standard VAT rate',
  vatRegistered: 'VAT registration',
  autoCalculateVat: 'automatic VAT calculation',
  'reminders.vat': 'VAT return reminder',
  'reminders.paye': 'PAYE return reminder',
  'reminders.cit': 'annual CIT return reminder',
  'reminders.pension': 'pension contribution reminder',
  defaultPaymentTerms: 'default invoice payment terms',
  lateInterestRate: 'late payment interest rate',
  applyLateFees: 'automatic late fees',
  'earlyPaymentDiscount.enabled': 'early payment discount',
  'earlyPaymentDiscount.percent': 'early payment discount percent',
  'earlyPaymentDiscount.days': 'early payment discount window (days)',
  'dunning.enabled': 'auto-dunning',
  'dunning.firstReminderDays': 'first dunning reminder (days overdue)',
  'dunning.secondReminderDays': 'second dunning reminder (days overdue)',
  'dunning.finalNoticeDays': 'final dunning notice (days overdue)',
  invoiceFooter: 'invoice footer text',
  creditNoteFooter: 'credit note footer',
  'rules.selfApprovalRestriction': 'self-approval restriction',
  'rules.receiptRequired': 'receipt requirement',
  'rules.receiptThreshold': 'receipt threshold',
  'rules.budgetCheck': 'budget check before approval',
  'rules.escalateOnTimeout': 'escalation on timeout',
  'rules.escalationHours': 'escalation timeout (hours)',
  matchingTolerance: 'bank matching tolerance',
  autoMatchByReference: 'auto-match by reference',
  suggestRules: 'rule suggestions',
  flagUnmatched: 'flagging of unmatched entries',
  flagUnmatchedAfterDays: 'unmatched flag threshold (days)',
  headerColor: 'header colour',
  accentColor: 'accent colour',
  highlightColor: 'highlight colour',
  companyName: 'company name on documents',
  tagline: 'tagline',
  address: 'address on documents',
  headingFont: 'heading font',
  bodyFont: 'body font',
  showLogo: 'logo on documents',
  showTagline: 'tagline on documents',
  footerWithAddressAndTin: 'footer with address and TIN',
  watermarkDrafts: 'draft watermark',
};

const show = (v: any): string =>
  v === null || v === undefined || v === ''
    ? 'none'
    : typeof v === 'string' && v.length > 60
      ? `${v.slice(0, 57)}…`
      : String(v);

const flatten = (o: any, prefix = '', out: Record<string, any> = {}) => {
  for (const k of Object.keys(o ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isObj(o[k])) flatten(o[k], key, out);
    else if (!Array.isArray(o[k])) out[key] = o[k];
  }
  return out;
};

const LISTS: Record<string, { key: string; noun: string; fields: string[] }> = {
  categories: { key: 'code', noun: 'tax category', fields: ['name', 'rate', 'active'] },
  whtCategories: { key: 'name', noun: 'withholding tax category', fields: ['rate'] },
  tiers: { key: 'name', noun: 'payment approval tier', fields: ['min', 'max', 'mode', 'approverIds', 'backupId'] },
  expenseLimits: { key: 'role', noun: 'expense limit', fields: ['monthlyLimit'] },
};

export const describeChanges = (
  before: Record<string, any>,
  after: Record<string, any>,
): string[] => {
  const lines: string[] = [];

  const fb = flatten(before);
  const fa = flatten(after);
  for (const k of Object.keys(fa)) {
    if (JSON.stringify(fb[k]) === JSON.stringify(fa[k])) continue;
    const label = LABELS[k] ?? LABELS[k.split('.').pop() as string] ?? k;
    if (typeof fa[k] === 'boolean') {
      lines.push(`${fa[k] ? 'enabled' : 'disabled'} ${label}`);
    } else {
      lines.push(`changed ${label} from ${show(fb[k])} to ${show(fa[k])}`);
    }
  }

  for (const listName of Object.keys(LISTS)) {
    const meta = LISTS[listName];
    if (!Array.isArray(after[listName])) continue;
    const b: any[] = Array.isArray(before[listName]) ? before[listName] : [];
    const a: any[] = after[listName];
    const bm = new Map(b.map((x) => [x[meta.key], x]));
    const am = new Map(a.map((x) => [x[meta.key], x]));
    for (const [id, row] of am) {
      if (!bm.has(id)) {
        lines.push(
          `added ${meta.noun}: ${id}${row.rate !== undefined && row.rate !== null ? ` (${row.rate}%)` : ''}`,
        );
      } else {
        const old = bm.get(id);
        const diffs = meta.fields.filter(
          (f) => JSON.stringify(old[f]) !== JSON.stringify(row[f]),
        );
        if (diffs.length)
          lines.push(`modified ${meta.noun}: ${id} (${diffs.join(', ')})`);
      }
    }
    for (const id of bm.keys()) {
      if (!am.has(id)) lines.push(`removed ${meta.noun}: ${id}`);
    }
  }
  return lines;
};
