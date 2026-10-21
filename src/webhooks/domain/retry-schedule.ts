const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

// Wait after the 1st, 2nd, ... failed attempt: about a day in total.
const DELAYS = [
  30 * SECOND,
  2 * MINUTE,
  10 * MINUTE,
  30 * MINUTE,
  1 * HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
];

export const MAX_ATTEMPTS = DELAYS.length + 1;

/** When to try again after `failedAttempts` failures, or null to give up. */
export function nextAttemptAt(failedAttempts: number, now: Date): Date | null {
  const delay = DELAYS[failedAttempts - 1];
  return delay === undefined ? null : new Date(now.getTime() + delay);
}
