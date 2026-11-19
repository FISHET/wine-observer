import assert from 'node:assert/strict';
import { mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { describe } from 'node:test';

import {
  createSyncer,
  credentialsFromEnv,
  filePath,
  MissingCredentialsError,
  singleFlight,
  sync,
} from '../src/sync.ts';

const credentials = { user: 'tom', password: 'secret' };
const csv = 'iWine,Wine,Quantity\n1,Château Batailley,6\n2,Vieux Télégraphe,1\n';

const newDataDir = () => mkdtemp(join(tmpdir(), 'cellar-'));

/** A CellarTracker that answers with latin-1 bytes, as the real one does. */
function stubFetch(body = csv) {
  let calls = 0;
  const impl = async () => {
    calls++;
    const bytes = Uint8Array.from([...body].map((c) => c.charCodeAt(0) & 0xff));
    return new Response(bytes);
  };
  return { impl: impl as unknown as typeof fetch, calls: () => calls };
}

/** Backdates the file so the freshness check sees it as old. */
async function age(path: string, ms: number) {
  const when = new Date(Date.now() - ms);
  await utimes(path, when, when);
}

describe('sync', () => {
  test('writes the cellar and reports how many rows it saved', async () => {
    const dataDir = await newDataDir();
    const fetchImpl = stubFetch();

    const outcome = await sync({ dataDir, credentials, fetchImpl: fetchImpl.impl });

    assert.equal(outcome.status, 'synced');
    assert.equal(outcome.status === 'synced' && outcome.records, 2);
    assert.equal(await readFile(filePath(dataDir), 'utf8'), csv);
  });

  test('leaves no temporary file behind', async () => {
    const dataDir = await newDataDir();
    await sync({ dataDir, credentials, fetchImpl: stubFetch().impl });

    await assert.rejects(() => readFile(`${filePath(dataDir)}.tmp`, 'utf8'));
  });

  test('skips a cellar synced within the hour, without asking CellarTracker', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir), csv, 'utf8');
    const fetchImpl = stubFetch();

    const outcome = await sync({ dataDir, credentials, fetchImpl: fetchImpl.impl });

    assert.equal(outcome.status, 'skipped');
    assert.equal(fetchImpl.calls(), 0);
  });

  test('syncs again once the cellar is stale', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir), 'old', 'utf8');
    await age(filePath(dataDir), 61 * 60 * 1000);
    const fetchImpl = stubFetch();

    const outcome = await sync({ dataDir, credentials, fetchImpl: fetchImpl.impl });

    assert.equal(outcome.status, 'synced');
    assert.equal(fetchImpl.calls(), 1);
  });

  test('force ignores the freshness check', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir), 'old', 'utf8');
    const fetchImpl = stubFetch();

    const outcome = await sync({ dataDir, credentials, force: true, fetchImpl: fetchImpl.impl });

    assert.equal(outcome.status, 'synced');
    assert.equal(fetchImpl.calls(), 1);
  });

  test('reports the age of the cellar it skipped', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir), csv, 'utf8');
    await age(filePath(dataDir), 20 * 60 * 1000);

    const outcome = await sync({ dataDir, credentials, fetchImpl: stubFetch().impl });

    assert.equal(outcome.status, 'skipped');
    assert.ok(outcome.status === 'skipped' && Math.abs(outcome.ageMs - 20 * 60 * 1000) < 5000);
  });

  test('keeps the previous cellar when CellarTracker fails', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir), csv, 'utf8');
    await age(filePath(dataDir), 61 * 60 * 1000);

    const failing = (async () => new Response('<html>Please sign in</html>')) as unknown as typeof fetch;
    await assert.rejects(() => sync({ dataDir, credentials, fetchImpl: failing }));

    assert.equal(await readFile(filePath(dataDir), 'utf8'), csv);
  });
});

describe('singleFlight', () => {
  test('a second caller joins the job already running', async () => {
    const run = singleFlight<number>();
    let started = 0;
    let release: (value: number) => void = () => {};
    const job = () => {
      started++;
      return new Promise<number>((resolve) => {
        release = resolve;
      });
    };

    const first = run(job);
    const second = run(job);
    release(7);

    assert.deepEqual(await Promise.all([first, second]), [7, 7]);
    assert.equal(started, 1, 'the job should only have run once');
  });

  test('a later caller starts a fresh job', async () => {
    const run = singleFlight<number>();
    let started = 0;
    const job = async () => ++started;

    await run(job);
    await run(job);

    assert.equal(started, 2);
  });

  test('a failure does not wedge the gate shut', async () => {
    const run = singleFlight<number>();
    await assert.rejects(() => run(async () => { throw new Error('nope'); }));
    assert.equal(await run(async () => 1), 1);
  });
});

describe('createSyncer', () => {
  /** A fetch that holds every request open until released. */
  function heldFetch() {
    const tables: string[] = [];
    const waiting: Array<() => void> = [];
    let arrived: () => void = () => {};
    const impl = (async (url: URL) => {
      tables.push(url.searchParams.get('Table')!);
      arrived();
      await new Promise<void>((release) => waiting.push(release));
      return new Response(Uint8Array.from([...csv].map((c) => c.charCodeAt(0) & 0xff)));
    }) as unknown as typeof fetch;

    /** Resolves once n requests have reached CellarTracker. */
    const reached = async (n: number) => {
      while (tables.length < n) await new Promise<void>((r) => (arrived = r));
    };
    return { impl, tables, reached, releaseAll: () => waiting.splice(0).forEach((r) => r()) };
  }

  test('the button and the nightly job share one fetch for the same table', async () => {
    const dataDir = await newDataDir();
    const fetch = heldFetch();
    const syncer = createSyncer({ dataDir, credentials: () => credentials, fetchImpl: fetch.impl });

    const button = syncer({ table: 'List', force: true });
    const nightly = syncer({ table: 'List' });
    await fetch.reached(1);
    // Give a second fetch every chance to start, if the lock were broken.
    await new Promise((r) => setTimeout(r, 20));
    fetch.releaseAll();
    await Promise.all([button, nightly]);

    assert.deepEqual(fetch.tables, ['List']);
  });

  test('different tables are not held up by each other', async () => {
    const dataDir = await newDataDir();
    const fetch = heldFetch();
    const syncer = createSyncer({ dataDir, credentials: () => credentials, fetchImpl: fetch.impl });

    const list = syncer({ table: 'List' });
    const notes = syncer({ table: 'Notes' });
    // Both in flight at once: neither has been released yet.
    await fetch.reached(2);
    assert.deepEqual(fetch.tables.sort(), ['List', 'Notes']);

    fetch.releaseAll();
    await Promise.all([list, notes]);
  });

  test('reads the credentials at sync time, so editing .env.local needs no restart', async () => {
    const dataDir = await newDataDir();
    let user = 'before';
    const seen: string[] = [];
    const fetchImpl = (async (url: URL) => {
      seen.push(url.searchParams.get('User')!);
      return new Response(csv);
    }) as unknown as typeof fetch;
    const syncer = createSyncer({ dataDir, credentials: () => ({ user, password: 'x' }), fetchImpl });

    await syncer({ force: true });
    user = 'after';
    await syncer({ force: true });

    assert.deepEqual(seen, ['before', 'after']);
  });
});

describe('credentialsFromEnv', () => {
  test('reads the pair from the environment', () => {
    assert.deepEqual(credentialsFromEnv({ CT_USER: 'tom', CT_PASSWORD: 'secret' }), {
      user: 'tom',
      password: 'secret',
    });
  });

  test('explains what to do when they are missing', () => {
    assert.throws(() => credentialsFromEnv({}), MissingCredentialsError);
    assert.throws(() => credentialsFromEnv({ CT_USER: 'tom' }), /CT_USER or CT_PASSWORD/);
  });
});
