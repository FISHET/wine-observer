import assert from 'node:assert/strict';
import { mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { describe } from 'node:test';

import { credentialsFromEnv, filePath, MissingCredentialsError, singleFlight, sync } from '../src/sync.ts';

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
