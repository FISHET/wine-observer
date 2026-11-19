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
 *   GET  /api/consumed       every wine drunk or tasted, from CellarTracker and
 *                            the Vivino export (data/vivino.csv) if present
 *   POST /api/consumed/sync  pull Consumed, Notes and Purchase from CellarTracker
 *   GET  /api/scores         every tasting, one line each, from both apps
 *   POST /api/scores/sync    pull the same tables as /api/consumed/sync
 *
 * Either sync takes ?force=1 to ignore the freshness limit.
 */
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { CellarTrackerError, type Credentials, type Table } from './cellartracker.ts';
import { join } from 'node:path';

import {
  consumedTotals,
  mergeWines,
  unmappedRegions,
  unmappedStyles,
  type ConsumedTotals,
  type ConsumedWine,
} from './consumed.ts';
import { buildTastings, scoresTotals, type ScoresTotals, type Tasting } from './scores.ts';
import { DataFileError, GRAPE_STYLES_FILE, parseGrapeStyles } from './grapeStyles.ts';
import { parseRegions, REGIONS_FILE } from './regions.ts';
import { buildEntries, fillProducers, parseConsumed, parseNotes, parseProducers } from './notes.ts';
import { parseVivino, VIVINO_FILE, WISHLIST_FILE } from './vivino.ts';
import type { NightlyStatus } from './nightly.ts';
import { CELLAR_TABLES, CONSUMED_TABLES, SCORES_TABLES } from './pageTables.ts';
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

export type ConsumedData = SyncedPage & {
  wines: ConsumedWine[];
  totals: ConsumedTotals;
  /** Check-ins read from the Vivino export, or null when there is none. */
  vivinoCheckIns: number | null;
  /** Vivino rows skipped because they don't say which wine it was. */
  vivinoUnidentified: number;
  /**
   * Vivino rows dropped as wishlist entries, or null when there's no
   * wishlist export to check against.
   */
  vivinoWishlisted: number | null;
  /** Vivino styles still to add to data/grape-styles.json. */
  unmappedStyles: string[];
  /** Regions not yet in data/regions.json, as "Region (Country)", most drunk first. */
  unmappedRegions: string[];
};

export type ScoresData = SyncedPage & {
  tastings: Tasting[];
  totals: ScoresTotals;
  /** Check-ins read from the Vivino export, or null when there is none. */
  vivinoCheckIns: number | null;
  /** Vivino check-ins left out because they have no rating and no review. */
  vivinoUnrated: number;
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

  /** A file in the data folder, or null when it isn't there. */
  async function readOptional(name: string): Promise<string | null> {
    try {
      return await readFile(join(dataDir, name), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  /**
   * The Vivino export, less the wishlist entries it mixes in, read on each
   * request: it's small, and replacing it needs no restart.
   */
  async function readVivino() {
    const csv = await readOptional(VIVINO_FILE);
    if (csv === null) return null;
    const wishlist = await readOptional(WISHLIST_FILE);
    return { export: parseVivino(csv, wishlist), hasWishlist: wishlist !== null };
  }

  /** The style-to-grape table, read on each request so edits show without a restart. */
  async function readGrapeStyles(): Promise<Map<string, string>> {
    const json = await readOptional(GRAPE_STYLES_FILE);
    return json === null ? new Map() : parseGrapeStyles(json);
  }

  /** The region-grouping table, read on each request like the grape table. */
  async function readRegions(): Promise<Map<string, string>> {
    const json = await readOptional(REGIONS_FILE);
    return json === null ? new Map() : parseRegions(json);
  }

  /** Every wine drunk or tasted, from both apps, with the check-ins behind each. */
  async function readMerged() {
    const tables = await readTables(CONSUMED_TABLES);
    const [consumed, notes, purchases] = tables;
    const producers = new Map([
      ...(purchases?.csv ? parseProducers(purchases.csv) : []),
      ...(notes?.csv ? parseProducers(notes.csv) : []),
    ]);
    const entries = buildEntries(
      fillProducers(consumed?.csv ? parseConsumed(consumed.csv) : [], producers),
      notes?.csv ? parseNotes(notes.csv) : [],
    );
    const read = await readVivino();
    const vivino = read?.export ?? null;
    const merged = mergeWines(entries, vivino?.checkIns ?? [], await readGrapeStyles(), await readRegions());
    return { tables, vivino, hasWishlist: read?.hasWishlist ?? false, merged };
  }

  async function readConsumed(): Promise<ConsumedData> {
    const { tables, vivino, hasWishlist, merged } = await readMerged();
    const wines = merged.map((m) => m.line);
    return {
      ...freshness(tables),
      wines,
      totals: consumedTotals(wines),
      vivinoCheckIns: vivino?.checkIns.length ?? null,
      vivinoUnidentified: vivino?.unidentified ?? 0,
      vivinoWishlisted: vivino && hasWishlist ? vivino.wishlisted : null,
      unmappedStyles: unmappedStyles(wines),
      unmappedRegions: unmappedRegions(wines),
    };
  }

  async function readScores(): Promise<ScoresData> {
    const { tables, vivino, merged } = await readMerged();
    const tastings = buildTastings(merged);
    return {
      ...freshness(tables),
      tastings,
      totals: scoresTotals(tastings),
      vivinoCheckIns: vivino?.checkIns.length ?? null,
      vivinoUnrated: vivino?.checkIns.filter((c) => !c.score && !c.review).length ?? 0,
    };
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

        case 'GET /api/consumed':
          return send(res, 200, await readConsumed());

        case 'POST /api/consumed/sync': {
          const outcome = await syncTables(CONSUMED_TABLES, force);
          const body: SyncResponse<ConsumedData> = { ...(await readConsumed()), outcome };
          return send(res, 200, body);
        }

        case 'GET /api/scores':
          return send(res, 200, await readScores());

        case 'POST /api/scores/sync': {
          const outcome = await syncTables(SCORES_TABLES, force);
          const body: SyncResponse<ScoresData> = { ...(await readScores()), outcome };
          return send(res, 200, body);
        }

        default:
          return send(res, 404, { error: `No route for ${route}` });
      }
    };

    handle().catch((error: unknown) => {
      // The credentials and CellarTracker's own refusals are the two failures
      // worth showing verbatim: both tell the user exactly what to go and fix.
      // A hand-edited data file that won't parse is the third: its message
      // names the file and what's wrong with it.
      const expected =
        error instanceof MissingCredentialsError ||
        error instanceof CellarTrackerError ||
        error instanceof DataFileError;
      const status =
        error instanceof MissingCredentialsError ? 400 : error instanceof DataFileError ? 500 : expected ? 502 : 500;

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
