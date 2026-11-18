/**
 * The cellar API.
 *
 * Written as connect-style middleware so the same handler runs inside the Vite
 * dev server and inside the standalone server (src/server.ts), rather than
 * having a dev path and a production path that can drift apart.
 *
 *   GET  /api/cellar      the parsed cellar, when it was last synced, and the
 *                         nightly sync's status (null under the dev server)
 *   POST /api/sync        pull the cellar (List) from CellarTracker
 *   GET  /api/notes       every tasting note and every bottle consumed
 *   POST /api/notes/sync  pull Consumed and Notes from CellarTracker
 *
 * Either sync takes ?force=1 to ignore the freshness limit.
 */
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { CellarTrackerError, type Credentials, type Table } from './cellartracker.ts';
import { buildEntries, notesTotals, parseConsumed, parseNotes, type Entry, type NotesTotals } from './notes.ts';
import type { NightlyStatus } from './nightly.ts';
import { CELLAR_TABLES, NOTES_TABLES } from './pageTables.ts';
import {
  createSyncer,
  credentialsFromEnv,
  filePath,
  lastSyncedAt,
  MINIMUM_AGE_MS,
  MissingCredentialsError,
  type SyncOutcome,
  type Syncer,
} from './sync.ts';
import { parseCellar, totals, type CellarTotals, type Wine } from './wine.ts';

/** What every page that shows synced data needs to explain its freshness. */
export type SyncedPage = {
  /** ISO timestamp of the stalest synced table behind the page; null if none ever has. */
  lastSyncedAt: string | null;
  /** Per table, so a nightly failure can be cleared once that table is fixed. */
  syncedAt: Partial<Record<Table, string | null>>;
  /** How long a sync is held off for, so the UI can explain the wait. */
  minimumAgeMs: number;
  /** Null when nothing is scheduled, as under the Vite dev server. */
  nightly: NightlyStatus | null;
};

export type Cellar = SyncedPage & {
  wines: Wine[];
  totals: CellarTotals;
};

export type NotesData = SyncedPage & {
  entries: Entry[];
  totals: NotesTotals;
};

export type OutcomeBody = { status: 'synced'; records: number } | { status: 'skipped'; ageMs: number };

export type SyncResponse<Page extends SyncedPage = Cellar> = Page & { outcome: OutcomeBody };

/**
 * One outcome for a sync of several tables. It counts as synced if any table
 * was fetched. Only when all were skipped is it a skip, and then the wait is
 * until the most recently synced one is due again.
 */
export function combineOutcomes(outcomes: readonly SyncOutcome[]): OutcomeBody {
  const synced = outcomes.filter((o) => o.status === 'synced');
  if (synced.length > 0) {
    return { status: 'synced', records: synced.reduce((sum, o) => sum + o.records, 0) };
  }
  const ages = outcomes.map((o) => (o.status === 'skipped' ? o.ageMs : 0));
  return { status: 'skipped', ageMs: Math.min(...ages) };
}

export type ApiOptions = {
  dataDir: string;
  minimumAgeMs?: number;
  fetchImpl?: typeof fetch;
  /**
   * Read afresh on each sync, rather than captured at startup, so correcting
   * .env.local doesn't need a restart. Overridable for tests.
   */
  credentials?: () => Credentials;
  /**
   * The process's shared syncer, so the API and the nightly job share one lock
   * per table. One is made from the options above when not given.
   */
  syncer?: Syncer;
  nightly?: () => NightlyStatus | null;
};

type Next = (error?: unknown) => void;

export function createApi(options: ApiOptions) {
  const {
    dataDir,
    minimumAgeMs = MINIMUM_AGE_MS,
    fetchImpl,
    credentials = () => credentialsFromEnv(),
    nightly = () => null,
  } = options;
  const syncer = options.syncer ?? createSyncer({ dataDir, credentials, minimumAgeMs, fetchImpl });

  /** Reads each table, or null for one never synced. */
  async function readTables(tables: readonly Table[]) {
    return Promise.all(
      tables.map(async (table) => {
        const path = filePath(dataDir, table);
        const syncedAt = await lastSyncedAt(path);
        return { table, syncedAt, csv: syncedAt ? await readFile(path, 'utf8') : null };
      }),
    );
  }

  /** The freshness fields. A page is as stale as its stalest synced table. */
  function freshness(tables: { table: Table; syncedAt: Date | null }[]): SyncedPage {
    const dates = tables.flatMap((t) => (t.syncedAt ? [t.syncedAt] : []));
    const stalest = dates.reduce<Date | null>((min, d) => (min && min < d ? min : d), null);

    return {
      lastSyncedAt: stalest?.toISOString() ?? null,
      syncedAt: Object.fromEntries(tables.map((t) => [t.table, t.syncedAt?.toISOString() ?? null])),
      minimumAgeMs,
      nightly: nightly(),
    };
  }

  async function readCellar(): Promise<Cellar> {
    const tables = await readTables(CELLAR_TABLES);
    const wines = tables[0]?.csv ? parseCellar(tables[0].csv) : [];
    return { ...freshness(tables), wines, totals: totals(wines) };
  }

  async function readNotes(): Promise<NotesData> {
    const tables = await readTables(NOTES_TABLES);
    const [consumed, notes] = tables;
    const entries = buildEntries(
      consumed?.csv ? parseConsumed(consumed.csv) : [],
      notes?.csv ? parseNotes(notes.csv) : [],
    );
    return { ...freshness(tables), entries, totals: notesTotals(entries) };
  }

  /** One table at a time, so a failure doesn't leave a second fetch running. */
  async function syncTables(tables: readonly Table[], force: boolean): Promise<OutcomeBody> {
    const outcomes: SyncOutcome[] = [];
    for (const table of tables) outcomes.push(await syncer({ table, force }));
    return combineOutcomes(outcomes);
  }

  return function api(req: IncomingMessage, res: ServerResponse, next: Next): void {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (!url.pathname.startsWith('/api/')) return next();

    const force = url.searchParams.get('force') === '1';
    const route = `${req.method} ${url.pathname}`;

    const handle = async () => {
      switch (route) {
        case 'GET /api/cellar':
          return send(res, 200, await readCellar());

        case 'POST /api/sync': {
          const outcome = await syncTables(CELLAR_TABLES, force);
          const body: SyncResponse<Cellar> = { ...(await readCellar()), outcome };
          return send(res, 200, body);
        }

        case 'GET /api/notes':
          return send(res, 200, await readNotes());

        case 'POST /api/notes/sync': {
          const outcome = await syncTables(NOTES_TABLES, force);
          const body: SyncResponse<NotesData> = { ...(await readNotes()), outcome };
          return send(res, 200, body);
        }

        default:
          return send(res, 404, { error: `No route for ${route}` });
      }
    };

    handle().catch((error: unknown) => {
      // The credentials and CellarTracker's own refusals are the two failures
      // worth showing verbatim: both tell the user exactly what to go and fix.
      const expected =
        error instanceof MissingCredentialsError || error instanceof CellarTrackerError;
      const status = error instanceof MissingCredentialsError ? 400 : expected ? 502 : 500;

      if (!expected) console.error(error);

      send(res, status, {
        error: expected && error instanceof Error ? error.message : 'Something went wrong.',
      });
    });
  };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store',
  });
  res.end(json);
}
