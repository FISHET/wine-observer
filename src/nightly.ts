/**
 * The nightly sync, as a safety net for days nobody pressed the button.
 *
 * It runs inside the server rather than from cron, so it shares the button's
 * lock and the UI can show when it last ran and whether it failed.
 *
 * A table already synced since local midnight is left alone: a sync done by
 * hand that evening counts for the night. Times are local, so set TZ in the
 * container (Europe/London) or "03:00" means 03:00 UTC.
 */
import type { Table } from './cellartracker.ts';
import { CellarTrackerError } from './cellartracker.ts';
import { MissingCredentialsError, type Syncer } from './sync.ts';

export type TimeOfDay = { hour: number; minute: number };

export type TableResult =
  | { table: Table; status: 'synced'; records: number }
  | { table: Table; status: 'skipped'; reason: 'synced today' | 'synced recently' }
  | { table: Table; status: 'failed'; error: string };

export type NightlyRun = {
  startedAt: string;
  finishedAt: string;
  tables: TableResult[];
};

export type NightlyStatus = {
  /** The configured time, as given: "03:00". */
  at: string;
  /** ISO timestamp of the next scheduled run, retries included. */
  nextRunAt: string | null;
  lastRun: NightlyRun | null;
};

/** Parses "03:00" or "3:00". Throws on anything else, so a typo fails at startup. */
export function parseTimeOfDay(value: string): TimeOfDay {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  const hour = Number(match?.[1]);
  const minute = Number(match?.[2]);

  if (!match || hour > 23 || minute > 59) {
    throw new Error(`Expected a time like 03:00, got "${value}"`);
  }

  return { hour, minute };
}

/** The next local occurrence of the time, strictly after now. */
export function nextOccurrence(now: Date, { hour, minute }: TimeOfDay): Date {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);

  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
    // Set again: across a clock change, adding a day can shift the hour.
    next.setHours(hour, minute, 0, 0);
  }

  return next;
}

/** Today's occurrence of the time, whether or not it has passed. */
export function todaysOccurrence(now: Date, { hour, minute }: TimeOfDay): Date {
  const today = new Date(now);
  today.setHours(hour, minute, 0, 0);
  return today;
}

export function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export type RunNightlyOptions = {
  tables: readonly Table[];
  syncer: Syncer;
  lastSyncedAt: (table: Table) => Promise<Date | null>;
  now?: () => Date;
  log?: (message: string) => void;
};

/**
 * Syncs each table not already synced today. One table failing doesn't stop
 * the rest, and the run never throws: failures are recorded in its result.
 */
export async function runNightly(options: RunNightlyOptions): Promise<NightlyRun> {
  const { tables, syncer, lastSyncedAt, now = () => new Date(), log = () => {} } = options;
  const startedAt = now();
  const results: TableResult[] = [];

  for (const table of tables) {
    const last = await lastSyncedAt(table);

    if (last && sameLocalDay(last, now())) {
      results.push({ table, status: 'skipped', reason: 'synced today' });
      continue;
    }

    try {
      const outcome = await syncer({ table });
      results.push(
        outcome.status === 'synced'
          ? { table, status: 'synced', records: outcome.records }
          : { table, status: 'skipped', reason: 'synced recently' },
      );
    } catch (error) {
      results.push({ table, status: 'failed', error: describe(error) });
    }
  }

  for (const result of results) log(summarise(result));

  return { startedAt: startedAt.toISOString(), finishedAt: now().toISOString(), tables: results };
}

/** Only messages we wrote ourselves are kept; they're known not to hold the password. */
function describe(error: unknown): string {
  if (error instanceof CellarTrackerError || error instanceof MissingCredentialsError) {
    return error.message;
  }
  console.error(error);
  return 'Unexpected error; see the server log.';
}

function summarise(result: TableResult): string {
  switch (result.status) {
    case 'synced':
      return `Nightly sync: ${result.table} synced, ${result.records} rows`;
    case 'skipped':
      return `Nightly sync: ${result.table} skipped, ${result.reason}`;
    case 'failed':
      return `Nightly sync: ${result.table} FAILED: ${result.error}`;
  }
}

export type Timers = {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type ScheduleOptions = {
  /** "03:00", local time. */
  at: string;
  run: () => Promise<NightlyRun>;
  /** A run with a failed table is tried once more after this long. */
  retryAfterMs?: number;
  /**
   * When the process starts after today's run time, run straight away rather
   * than waiting a day. Tables synced today are still skipped, so a restart
   * costs nothing once the day's sync has happened.
   */
  catchUp?: boolean;
  now?: () => Date;
  timers?: Timers;
};

export type Schedule = {
  status: () => NightlyStatus;
  stop: () => void;
  /** Resolves when any run in progress finishes. For tests and shutdown. */
  idle: () => Promise<void>;
};

export function scheduleNightly(options: ScheduleOptions): Schedule {
  const {
    at,
    run,
    retryAfterMs = 60 * 60 * 1000,
    catchUp = true,
    now = () => new Date(),
    timers = { setTimeout, clearTimeout } as unknown as Timers,
  } = options;
  const time = parseTimeOfDay(at);

  let handle: unknown = null;
  let nextRunAt: Date | null = null;
  let lastRun: NightlyRun | null = null;
  let running: Promise<void> = Promise.resolve();
  let stopped = false;

  function schedule(when: Date, isRetry: boolean) {
    if (stopped) return;
    nextRunAt = when;
    handle = timers.setTimeout(() => fire(isRetry), Math.max(0, when.getTime() - now().getTime()));
  }

  function fire(isRetry: boolean) {
    nextRunAt = null;
    running = run().then((result) => {
      lastRun = result;
      const failed = result.tables.some((t) => t.status === 'failed');

      if (failed && !isRetry) schedule(new Date(now().getTime() + retryAfterMs), true);
      else schedule(nextOccurrence(now(), time), false);
    });
  }

  const start = now();
  if (catchUp && start.getTime() >= todaysOccurrence(start, time).getTime()) {
    schedule(start, false);
  } else {
    schedule(nextOccurrence(start, time), false);
  }

  return {
    status: () => ({ at, nextRunAt: nextRunAt?.toISOString() ?? null, lastRun }),
    stop: () => {
      stopped = true;
      if (handle !== null) timers.clearTimeout(handle);
      nextRunAt = null;
    },
    idle: () => running,
  };
}
