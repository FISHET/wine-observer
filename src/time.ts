/** Human wording for times and waits. Pure, so it can be tested directly. */

const relative = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });

const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "just now", "3 minutes ago", "yesterday". */
export function timeAgo(then: Date, now: Date = new Date()): string {
  const elapsed = now.getTime() - then.getTime();
  if (elapsed < 60_000) return 'just now';

  for (const [unit, size] of UNITS) {
    if (elapsed >= size) return relative.format(-Math.floor(elapsed / size), unit);
  }

  return 'just now';
}

/** "40 minutes", "2 hours". Used for how long until a sync is allowed again. */
export function duration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;

  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}
