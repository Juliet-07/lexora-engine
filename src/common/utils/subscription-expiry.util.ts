// One definition of "a subscription is about to expire", shared by the
// reminder emails (SubscriptionExpiryService) and the tenant dashboard
// indicator, so the two can never disagree about when a warning starts.

/** Days before expiry on which a reminder email goes out. */
export const EXPIRY_WARNING_DAYS = [7, 3, 1];

export type ExpiryStage = 'notice' | 'important' | 'urgent';

export interface SubscriptionExpiry {
  expiresAt: Date;
  /** Whole days left, rounded up; 0 once the end date has passed. */
  daysLeft: number;
  /** null while the subscription is further from expiry than the first reminder. */
  stage: ExpiryStage | null;
  isTrial: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** notice ≤ first reminder (7 days), important ≤ 3 days, urgent ≤ 1 day. */
export function expiryStage(daysLeft: number): ExpiryStage | null {
  const [first, second, last] = EXPIRY_WARNING_DAYS;
  if (daysLeft <= last) return 'urgent';
  if (daysLeft <= second) return 'important';
  if (daysLeft <= first) return 'notice';
  return null;
}

/**
 * Where a tenant's subscription stands against its end date. Null when there
 * is nothing to count down to (no subscription, no end date) or the
 * subscription is already cancelled/expired — those have their own screens.
 */
export function subscriptionExpiry(
  sub:
    | {
        status?: string | null;
        currentPeriodEnd?: Date | string | null;
        trialEndsAt?: Date | string | null;
      }
    | null
    | undefined,
  now: Date = new Date(),
): SubscriptionExpiry | null {
  if (!sub) return null;
  const isTrial = sub.status === 'trial';
  if (!isTrial && sub.status !== 'active') return null;
  const end = isTrial
    ? (sub.trialEndsAt ?? sub.currentPeriodEnd)
    : sub.currentPeriodEnd;
  if (!end) return null;
  const expiresAt = new Date(end);
  const daysLeft = Math.max(
    0,
    Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS),
  );
  return { expiresAt, daysLeft, stage: expiryStage(daysLeft), isTrial };
}
