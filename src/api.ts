/**
 * The cellar API.
 *
 * Written as connect-style middleware so the same handler runs inside the Vite
 * dev server and inside the standalone server (src/server.ts), rather than
 * having a dev path and a production path that can drift apart.
 *
 *   GET  /api/cellar      the parsed cellar, when it was last synced, and the
 *                         nightly sync's status (null under the dev server)
 *   POST /api/sync        pull from CellarTracker; ?force=1 ignores the limit
 */
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { CellarTrackerError, type Credentials } from './cellartracker.ts';
import type { NightlyStatus } from './nightly.ts';
import {
  createSyncer,
  credentialsFromEnv,
  filePath,
  lastSyncedAt,
  MINIMUM_AGE_MS,
  MissingCredentialsError,
  type Syncer,
} from './sync.ts';
import { parseCellar, totals, type CellarTotals, type Wine } from './wine.ts';

export type Cellar = {
  wines: Wine[];
  totals: CellarTotals;
  /** ISO timestamp, or null when the cellar has never been synced. */
  lastSyncedAt: string | null;
  /** How long a sync is held off for, so the UI can explain the wait. */
  minimumAgeMs: number;
  /** Null when nothing is scheduled, as under the Vite dev server. */
  nightly: NightlyStatus | null;
};

export type SyncResponse = Cellar & {
  outcome: { status: 'synced'; records: number } | { status: 'skipped'; ageMs: number };
};

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
  const path = filePath(dataDir);

  async function readCellar(): Promise<Cellar> {
    const syncedAt = await lastSyncedAt(path);

    if (syncedAt === null) {
      return {
        wines: [],
        totals: totals([]),
        lastSyncedAt: null,
        minimumAgeMs,
        nightly: nightly(),
      };
    }

    const csv = await readFile(path, 'utf8');
    const wines = parseCellar(csv);

    return {
      wines,
      totals: totals(wines),
      lastSyncedAt: syncedAt.toISOString(),
      minimumAgeMs,
      nightly: nightly(),
    };
  }

  return function api(req: IncomingMessage, res: ServerResponse, next: Next): void {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (!url.pathname.startsWith('/api/')) return next();

    const handle = async () => {
      if (req.method === 'GET' && url.pathname === '/api/cellar') {
        return send(res, 200, await readCellar());
      }

      if (req.method === 'POST' && url.pathname === '/api/sync') {
        const force = url.searchParams.get('force') === '1';
        const outcome = await syncer({ table: 'List', force });

        const body: SyncResponse = {
          ...(await readCellar()),
          outcome:
            outcome.status === 'synced'
              ? { status: 'synced', records: outcome.records }
              : { status: 'skipped', ageMs: outcome.ageMs },
        };
        return send(res, 200, body);
      }

      return send(res, 404, { error: `No route for ${req.method} ${url.pathname}` });
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
