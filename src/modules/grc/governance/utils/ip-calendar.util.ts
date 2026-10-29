import { IpAssetStatus } from '../schemas/ip-asset.schema';

// One place that decides which IP dates are "compliance events", used
// by BOTH the Renewals & Deadlines tab and the calendars (the tenant
// Compliance Calendar page and the CRM calendar's Compliance layer) so
// they can never disagree. Nothing is copied: the dates are read live
// off the IP register every time.

export type IpDueKind = 'expiry' | 'deadline';

export interface IpDueItem {
  key: string; // stable id for the calendar entry
  assetId: string;
  assetName: string;
  assetType: string;
  kind: IpDueKind;
  deadlineId: string | null;
  label: string; // e.g. "Renewal due" / the custom deadline's label
  action: string; // what to do about it
  dueDate: Date;
  daysLeft: number; // negative = overdue
  urgency: 'overdue' | 'critical' | 'soon' | 'ok';
  jurisdiction: string;
}

const DAY = 86_400_000;

// <90 days red, <365 days amber (the prototype's thresholds), anything
// already past is overdue.
export function ipUrgency(daysLeft: number): IpDueItem['urgency'] {
  if (daysLeft < 0) return 'overdue';
  if (daysLeft < 90) return 'critical';
  if (daysLeft < 365) return 'soon';
  return 'ok';
}

export function ipRenewalAction(assetType: string): string {
  switch (assetType) {
    case 'Domain Name':
      return 'Renew domain registration';
    case 'Trademark':
      return 'File renewal application';
    case 'Patent':
      return 'Pay renewal fee';
    default:
      return 'Review and renew';
  }
}

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * Every open dated item on the IP register: each asset's expiry (as a
 * renewal) plus each deadline not yet marked done. Abandoned assets are
 * left out — nothing is going to be renewed.
 */
export function ipDueItems(assets: any[], now: Date = new Date()): IpDueItem[] {
  const out: IpDueItem[] = [];
  const today = startOfDay(now);
  const days = (d: Date) => Math.round((startOfDay(new Date(d)) - today) / DAY);

  for (const a of assets) {
    if (a.status === IpAssetStatus.ABANDONED) continue;
    const assetId = String(a._id);

    if (a.expiryDate) {
      const daysLeft = days(a.expiryDate);
      out.push({
        key: `ip-exp-${assetId}`,
        assetId,
        assetName: a.name,
        assetType: a.type,
        kind: 'expiry',
        deadlineId: null,
        label: 'Renewal due',
        action: ipRenewalAction(a.type),
        dueDate: new Date(a.expiryDate),
        daysLeft,
        urgency: ipUrgency(daysLeft),
        jurisdiction: a.jurisdiction ?? '',
      });
    }

    for (const d of a.deadlines ?? []) {
      if (d.done) continue;
      const daysLeft = days(d.dueDate);
      out.push({
        key: `ip-dl-${assetId}-${String(d._id)}`,
        assetId,
        assetName: a.name,
        assetType: a.type,
        kind: 'deadline',
        deadlineId: String(d._id),
        label: d.label,
        action: d.label,
        dueDate: new Date(d.dueDate),
        daysLeft,
        urgency: ipUrgency(daysLeft),
        jurisdiction: a.jurisdiction ?? '',
      });
    }
  }
  return out.sort((x, y) => x.dueDate.getTime() - y.dueDate.getTime());
}
