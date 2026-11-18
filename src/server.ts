/**
 * The standalone server: the built app, the API, and the nightly sync, in one
 * process. This is what runs in the container. `npm run dev` doesn't use it.
 */
import { createServer, type Server } from 'node:http';

import { createApi } from './api.ts';
import type { Table } from './cellartracker.ts';
import { runNightly, scheduleNightly, type Schedule } from './nightly.ts';
import { serveStatic } from './static.ts';
import { createSyncer, credentialsFromEnv, filePath, lastSyncedAt } from './sync.ts';

/** List is the stock. Notes will feed the tasting-notes view. */
export const NIGHTLY_TABLES: readonly Table[] = ['List', 'Notes'];

export type ServerOptions = {
  dataDir: string;
  distDir: string;
  /** "03:00", local time, or null to switch the nightly sync off. */
  nightlyAt: string | null;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
};

export type CellarServer = { server: Server; schedule: Schedule | null; close: () => Promise<void> };

export function createCellarServer(options: ServerOptions): CellarServer {
  const { dataDir, distDir, nightlyAt, fetchImpl, log = console.log } = options;

  const syncer = createSyncer({ dataDir, credentials: () => credentialsFromEnv(), fetchImpl });

  const schedule = nightlyAt
    ? scheduleNightly({
        at: nightlyAt,
        run: () =>
          runNightly({
            tables: NIGHTLY_TABLES,
            syncer,
            lastSyncedAt: (table) => lastSyncedAt(filePath(dataDir, table)),
            log,
          }),
      })
    : null;

  const api = createApi({ dataDir, syncer, nightly: () => schedule?.status() ?? null });
  const statics = serveStatic(distDir);

  const server = createServer((req, res) => {
    api(req, res, (error) => {
      if (error) {
        console.error(error);
        res.writeHead(500).end();
        return;
      }
      statics(req, res).catch((caught: unknown) => {
        console.error(caught);
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    });
  });

  return {
    server,
    schedule,
    close: async () => {
      schedule?.stop();
      await new Promise<void>((done) => server.close(() => done()));
      // Let a nightly run in progress finish its write rather than cut it off.
      await schedule?.idle();
    },
  };
}
