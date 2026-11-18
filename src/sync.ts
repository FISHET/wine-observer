/**
 * Pulling the cellar from CellarTracker and keeping it on disk.
 *
 * Shared by the `npm run sync` script and the API, so there is one code path
 * and one set of rules about how often CellarTracker may be asked.
 */
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { fetchTable, type Credentials, type Table } from './cellartracker.ts';
import { countRecords } from './csv.ts';

/**
 * CellarTracker ask that the export is not hammered, and a sync button invites
 * exactly that. Anything fetched within the hour is reused unless forced.
 */
export const MINIMUM_AGE_MS = 60 * 60 * 1000;

export const FILE_NAMES: Record<Table, string> = {
  List: 'cellar.csv',
  Inventory: 'inventory.csv',
  Notes: 'notes.csv',
  Purchase: 'purchases.csv',
  Pending: 'pending.csv',
  Consumed: 'consumed.csv',
};

export type SyncOutcome =
  | { status: 'synced'; records: number; syncedAt: Date }
  /** Still fresh, so CellarTracker was not asked. */
  | { status: 'skipped'; syncedAt: Date; ageMs: number };

export type SyncOptions = {
  dataDir: string;
  credentials: Credentials;
  table?: Table;
  force?: boolean;
  minimumAgeMs?: number;
  fetchImpl?: typeof fetch;
};

export function filePath(dataDir: string, table: Table = 'List'): string {
  return join(dataDir, FILE_NAMES[table]);
}

/** When the file was last written, or null if it has never been synced. */
export async function lastSyncedAt(path: string): Promise<Date | null> {
  try {
    return new Date((await stat(path)).mtimeMs);
  } catch {
    return null;
  }
}

export async function sync(options: SyncOptions): Promise<SyncOutcome> {
  const {
    dataDir,
    credentials,
    table = 'List',
    force = false,
    minimumAgeMs = MINIMUM_AGE_MS,
    fetchImpl,
  } = options;

  const destination = filePath(dataDir, table);
  const previous = await lastSyncedAt(destination);

  if (!force && previous !== null) {
    const ageMs = Date.now() - previous.getTime();
    if (ageMs < minimumAgeMs) {
      return { status: 'skipped', syncedAt: previous, ageMs };
    }
  }

  const csv = await fetchTable(credentials, table, fetchImpl);

  await mkdir(dataDir, { recursive: true });
  // Write beside the target and rename, so a failed write can never leave a
  // half-written cellar behind for the app to read.
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, csv, 'utf8');
  await rename(temporary, destination);

  return {
    status: 'synced',
    records: countRecords(csv),
    syncedAt: (await lastSyncedAt(destination)) ?? new Date(),
  };
}

/**
 * Runs one job at a time. A second caller while a sync is in flight waits for
 * the first rather than starting a duplicate fetch.
 */
export function singleFlight<T>(): (job: () => Promise<T>) => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return (job) => {
    if (inFlight) return inFlight;
    inFlight = job().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

export type SyncRequest = { table?: Table; force?: boolean };

/** Syncs one table. Each process should hold exactly one of these. */
export type Syncer = (request?: SyncRequest) => Promise<SyncOutcome>;

export type SyncerOptions = Omit<SyncOptions, 'table' | 'force' | 'credentials'> & {
  /**
   * Read afresh on each sync, rather than captured at startup, so correcting
   * .env.local doesn't need a restart.
   */
  credentials: () => Credentials;
};

/**
 * One lock per table, shared by everything that syncs: the button and the
 * nightly job can't both fetch the same table at once.
 */
export function createSyncer(options: SyncerOptions): Syncer {
  const { credentials, ...rest } = options;
  const gates = new Map<Table, ReturnType<typeof singleFlight<SyncOutcome>>>();

  return ({ table = 'List', force = false } = {}) => {
    let gate = gates.get(table);
    if (!gate) {
      gate = singleFlight<SyncOutcome>();
      gates.set(table, gate);
    }
    return gate(() => sync({ ...rest, credentials: credentials(), table, force }));
  };
}

export class MissingCredentialsError extends Error {}

/** Reads the credentials from the environment, failing with a useful message. */
export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): Credentials {
  const user = env['CT_USER'];
  const password = env['CT_PASSWORD'];

  if (!user || !password) {
    throw new MissingCredentialsError(
      'Missing CT_USER or CT_PASSWORD. Copy .env.local.example to .env.local and fill it in.',
    );
  }

  return { user, password };
}
