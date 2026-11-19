/**
 * Runs the built app, the API and the nightly sync. What the container runs.
 *
 *   npm run build && npm start
 *
 * Environment (all optional apart from the credentials):
 *   CT_USER, CT_PASSWORD   from the environment or .env.local
 *   PORT                   default 8080
 *   HOST                   default 0.0.0.0, so the LAN can reach it
 *   NIGHTLY_SYNC_AT        local time, default 03:00; "off" disables it
 *   TZ                     set it (Europe/London), or the nightly time is UTC
 */
import { join } from 'node:path';

import { loadEnv } from '../src/env.ts';
import { dataDir, distDir, projectRoot } from '../src/paths.ts';
import { createCellarServer, NIGHTLY_TABLES } from '../src/server.ts';

loadEnv(join(projectRoot, '.env.local'));

const port = Number(process.env['PORT'] ?? 8080);
const host = process.env['HOST'] ?? '0.0.0.0';
const nightlySetting = process.env['NIGHTLY_SYNC_AT'] ?? '03:00';
const nightlyAt = nightlySetting.toLowerCase() === 'off' ? null : nightlySetting;

const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`);

const cellar = createCellarServer({ dataDir, distDir, nightlyAt, log });

cellar.server.listen(port, host, () => {
  log(`Cellar listening on http://${host}:${port}`);

  const status = cellar.schedule?.status();
  if (status) {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    log(
      `Nightly sync of ${NIGHTLY_TABLES.join(', ')} at ${status.at} ${zone}; ` +
        `next run ${status.nextRunAt}`,
    );
  } else {
    log('Nightly sync is off');
  }
});

// docker stop sends SIGTERM; Ctrl+C sends SIGINT.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    log(`${signal} received, shutting down`);
    cellar.close().then(
      () => (process.exitCode = 0),
      (error: unknown) => {
        console.error(error);
        process.exitCode = 1;
      },
    );
  });
}
