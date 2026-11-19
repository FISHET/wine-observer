/**
 * Pulls a table from CellarTracker and saves it under data/.
 *
 *   npm run sync                 # the List table -> data/cellar.csv
 *   npm run sync -- --table Notes
 *   npm run sync -- --force      # ignore the freshness check
 *
 * The rules live in src/sync.ts, shared with the API, so the command line and
 * the app's sync button behave the same way.
 */
import { join } from 'node:path';

import { loadEnv } from '../src/env.ts';
import { TABLES, type Table } from '../src/cellartracker.ts';
import { credentialsFromEnv, FILE_NAMES, sync } from '../src/sync.ts';
import { projectRoot } from '../src/paths.ts';

loadEnv(join(projectRoot, '.env.local'));

/** A problem with how the script was invoked, rather than with CellarTracker. */
class UsageError extends Error {}

function fail(message: string): never {
  throw new UsageError(message);
}

function asTable(value: string | undefined): Table {
  if (value && (TABLES as readonly string[]).includes(value)) return value as Table;
  fail(`--table must be one of: ${TABLES.join(', ')}`);
}

function parseArgs(argv: string[]): { table: Table; force: boolean } {
  let table: Table = 'List';
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--force' || arg === '-f') force = true;
    else if (arg === '--table' || arg === '-t') table = asTable(argv[++i]);
    else if (arg.startsWith('--table=')) table = asTable(arg.slice('--table='.length));
    else fail(`Unknown argument: ${arg}`);
  }

  return { table, force };
}

async function main() {
  const { table, force } = parseArgs(process.argv.slice(2));
  const credentials = credentialsFromEnv();

  console.log(`Fetching the ${table} table from CellarTracker as ${credentials.user}...`);
  const outcome = await sync({ dataDir: join(projectRoot, 'data'), credentials, table, force });

  if (outcome.status === 'skipped') {
    const minutes = Math.round(outcome.ageMs / 60_000);
    console.log(
      `${FILE_NAMES[table]} was synced ${minutes} minute(s) ago; skipping. Use --force to sync anyway.`,
    );
    return;
  }

  console.log(`Saved ${outcome.records} rows to data/${FILE_NAMES[table]}`);
}

// Set exitCode rather than calling process.exit, so Node can close its sockets
// cleanly. Tearing them down mid-flight trips a libuv assertion on Windows.
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
