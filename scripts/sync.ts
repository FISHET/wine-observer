/**
 * Pulls a table from CellarTracker and saves it under data/.
 *
 *   npm run sync                 # the List table -> data/cellar.csv
 *   npm run sync -- --table Notes
 *   npm run sync -- --force      # ignore the freshness check
 *
 * CellarTracker ask that exports are not hammered, so a file fetched within
 * the last hour is left alone unless --force is given.
 */
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchTable, TABLES, type Table } from '../src/cellartracker.ts';
import { loadEnv } from '../src/env.ts';
import { countRecords } from '../src/csv.ts';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(projectRoot, 'data');
const minimumAgeMs = 60 * 60 * 1000;

// Read .env.local ourselves rather than with --env-file; see src/env.ts.
loadEnv(join(projectRoot, '.env.local'));

const fileNames: Record<Table, string> = {
  List: 'cellar.csv',
  Inventory: 'inventory.csv',
  Notes: 'notes.csv',
  Purchase: 'purchases.csv',
  Pending: 'pending.csv',
  Consumed: 'consumed.csv',
};

function parseArgs(argv: string[]): { table: Table; force: boolean } {
  let table: Table = 'List';
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--force' || arg === '-f') {
      force = true;
    } else if (arg === '--table' || arg === '-t') {
      table = asTable(argv[++i]);
    } else if (arg.startsWith('--table=')) {
      table = asTable(arg.slice('--table='.length));
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }

  return { table, force };
}

function asTable(value: string | undefined): Table {
  if (value && (TABLES as readonly string[]).includes(value)) return value as Table;
  fail(`--table must be one of: ${TABLES.join(', ')}`);
}

/** A problem with how the script was invoked, rather than with CellarTracker. */
class UsageError extends Error {}

function fail(message: string): never {
  throw new UsageError(message);
}

async function ageMs(path: string): Promise<number | null> {
  try {
    return Date.now() - (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
}

async function main() {
  const { table, force } = parseArgs(process.argv.slice(2));

  const user = process.env.CT_USER;
  const password = process.env.CT_PASSWORD;

  if (!user || !password) {
    fail(
      'Missing CT_USER or CT_PASSWORD.\n' +
        'Copy .env.local.example to .env.local and fill in your CellarTracker login.',
    );
  }

  const destination = join(dataDir, fileNames[table]);
  const existingAge = await ageMs(destination);

  if (!force && existingAge !== null && existingAge < minimumAgeMs) {
    const minutes = Math.round(existingAge / 60_000);
    console.log(
      `${fileNames[table]} was synced ${minutes} minute(s) ago; skipping. Use --force to sync anyway.`,
    );
    return;
  }

  console.log(`Fetching the ${table} table from CellarTracker as ${user}...`);
  const csv = await fetchTable({ user, password }, table);

  await mkdir(dataDir, { recursive: true });
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, csv, 'utf8');
  await rename(temporary, destination);

  console.log(`Saved ${countRecords(csv)} rows to data/${fileNames[table]}`);
}

// Set exitCode rather than calling process.exit, so Node can close its sockets
// cleanly. Tearing them down mid-flight trips a libuv assertion on Windows.
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
