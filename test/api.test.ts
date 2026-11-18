import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { describe } from 'node:test';

import {
  combineOutcomes,
  createApi,
  type Cellar,
  type NotesData,
  type SyncResponse,
} from '../src/api.ts';
import { filePath } from '../src/sync.ts';

const csv =
  'iWine,Wine,Quantity,Pending,Vintage,Producer,Type,Country\n' +
  '1,Château Batailley,6,0,2022,Château Batailley,Red,France\n' +
  '2,Chapel Down,1,0,1001,Chapel Down,White - Sparkling,England\n';

const testCredentials = () => ({ user: 'tom', password: 'secret' });

const newDataDir = () => mkdtemp(join(tmpdir(), 'cellar-api-'));

const stubFetch = (body = csv) =>
  (async () =>
    new Response(Uint8Array.from([...body].map((c) => c.charCodeAt(0) & 0xff)))) as unknown as typeof fetch;

type Result = { status: number; body: any; nexted: boolean };

/** Drives the middleware with a fake request and collects what it answered. */
function call(
  api: ReturnType<typeof createApi>,
  method: string,
  url: string,
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const res = {
      writeHead(status: number) {
        (this as any).status = status;
        return this;
      },
      end(body: string) {
        try {
          resolve({ status: (this as any).status, body: JSON.parse(body), nexted: false });
        } catch (error) {
          reject(error);
        }
      },
    } as unknown as ServerResponse;

    api({ method, url } as IncomingMessage, res, (error) => {
      if (error) reject(error);
      else resolve({ status: 0, body: null, nexted: true });
    });
  });
}

describe('GET /api/cellar', () => {
  test('returns the parsed cellar with its totals', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir), csv, 'utf8');

    const { status, body } = await call(createApi({ dataDir }), 'GET', '/api/cellar');
    const cellar = body as Cellar;

    assert.equal(status, 200);
    assert.equal(cellar.wines.length, 2);
    assert.deepEqual(cellar.totals, { wines: 2, bottles: 7, pending: 0 });
    assert.equal(cellar.wines[0]!.wine, 'Château Batailley');
    assert.ok(cellar.lastSyncedAt, 'should report when it was synced');
  });

  test('is empty rather than broken before the first sync', async () => {
    const dataDir = await newDataDir();

    const { status, body } = await call(createApi({ dataDir }), 'GET', '/api/cellar');

    assert.equal(status, 200);
    assert.deepEqual((body as Cellar).wines, []);
    assert.equal((body as Cellar).lastSyncedAt, null);
  });

  test('applies the NV rule on the way out', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir), csv, 'utf8');

    const { body } = await call(createApi({ dataDir }), 'GET', '/api/cellar');
    const nv = (body as Cellar).wines.find((w) => w.wine === 'Chapel Down')!;

    assert.equal(nv.isNonVintage, true);
    assert.equal(nv.vintage, null);
  });
});

describe('POST /api/sync', () => {
  test('pulls from CellarTracker and returns the fresh cellar', async () => {
    const dataDir = await newDataDir();
    const api = createApi({ dataDir, fetchImpl: stubFetch(), credentials: testCredentials });

    const { status, body } = await call(api, 'POST', '/api/sync');
    const response = body as SyncResponse;

    assert.equal(status, 200);
    assert.deepEqual(response.outcome, { status: 'synced', records: 2 });
    assert.equal(response.wines.length, 2);
  });

  test('reports a skip rather than hammering CellarTracker', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir), csv, 'utf8');
    let calls = 0;
    const counting = (async () => {
      calls++;
      return new Response('');
    }) as unknown as typeof fetch;

    const { body } = await call(createApi({ dataDir, fetchImpl: counting, credentials: testCredentials }), 'POST', '/api/sync');

    assert.equal((body as SyncResponse).outcome.status, 'skipped');
    assert.equal(calls, 0);
  });

  test('force=1 overrides the freshness check', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir), 'stale', 'utf8');
    const api = createApi({ dataDir, fetchImpl: stubFetch(), credentials: testCredentials });

    const { body } = await call(api, 'POST', '/api/sync?force=1');

    assert.equal((body as SyncResponse).outcome.status, 'synced');
  });

  test('explains a CellarTracker refusal without leaking the password', async () => {
    const dataDir = await newDataDir();
    const refusing = (async () =>
      new Response('You are currently not logged into CellarTracker.')) as unknown as typeof fetch;

    const { status, body } = await call(
      createApi({ dataDir, fetchImpl: refusing, credentials: testCredentials }),
      'POST',
      '/api/sync',
    );

    assert.equal(status, 502);
    assert.match(body.error, /not logged into CellarTracker/);
    assert.ok(!body.error.includes('secret'), 'the password must not appear');
  });
});

const consumedCsv =
  'iConsumed,iWine,ConsumedYear,ConsumedMonth,ConsumedDay,ShortType,iNote,Vintage,Wine\n' +
  '1,100,2026,11,15,Drank,500,2016,Château Larrivet-Haut-Brion\n' +
  '2,200,2026,9,26,Drank,0,2022,Château de Beaucastel\n';

const notesCsv =
  'iNote,iWine,TastingDate,Rating,TastingNotes\n' +
  '500,100,15/11/2026,82,Thin.\n' +
  '501,200,27/09/2026,93,Written up the next morning.\n';

/** Answers each CellarTracker table with its own CSV, latin-1 encoded like the real thing. */
function tableFetch(tables: Record<string, string>, asked: string[] = []) {
  return (async (url: URL) => {
    const table = new URL(url).searchParams.get('Table')!;
    asked.push(table);
    const body = tables[table] ?? '';
    return new Response(Uint8Array.from([...body].map((c) => c.charCodeAt(0) & 0xff)));
  }) as unknown as typeof fetch;
}

describe('GET /api/notes', () => {
  test('returns bottles joined to their notes', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir, 'Consumed'), consumedCsv, 'utf8');
    await writeFile(filePath(dataDir, 'Notes'), notesCsv, 'utf8');

    const { status, body } = await call(createApi({ dataDir }), 'GET', '/api/notes');
    const page = body as NotesData;

    assert.equal(status, 200);
    assert.deepEqual(page.totals, { notes: 2, bottles: 2, notesWithoutBottle: 0, bottlesWithoutNote: 0 });
    assert.equal(page.entries[0]!.note?.text, 'Thin.');
    assert.equal(page.entries[1]!.note?.id, '501', 'matched by wine and date');
    assert.ok(page.syncedAt.Consumed && page.syncedAt.Notes);
  });

  test('shows bottles without notes when Notes has never synced', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir, 'Consumed'), consumedCsv, 'utf8');

    const { body } = await call(createApi({ dataDir }), 'GET', '/api/notes');
    const page = body as NotesData;

    assert.equal(page.entries.length, 2);
    assert.ok(page.lastSyncedAt);
    assert.equal(page.syncedAt.Notes, null);
  });

  test('lists notes on their own when Consumed has never synced', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir, 'Notes'), notesCsv, 'utf8');

    const { body } = await call(createApi({ dataDir }), 'GET', '/api/notes');
    const page = body as NotesData;

    assert.equal(page.entries.length, 2);
    assert.ok(page.entries.every((e) => e.bottle === null));
    assert.ok(page.lastSyncedAt);
  });

  test('is empty rather than broken before the first sync', async () => {
    const dataDir = await newDataDir();

    const { body } = await call(createApi({ dataDir }), 'GET', '/api/notes');

    assert.deepEqual((body as NotesData).entries, []);
    assert.equal((body as NotesData).lastSyncedAt, null);
  });
});

describe('POST /api/notes/sync', () => {
  test('pulls Consumed and Notes, and returns the joined page', async () => {
    const dataDir = await newDataDir();
    const asked: string[] = [];
    const api = createApi({
      dataDir,
      fetchImpl: tableFetch({ Consumed: consumedCsv, Notes: notesCsv }, asked),
      credentials: testCredentials,
    });

    const { status, body } = await call(api, 'POST', '/api/notes/sync');
    const response = body as SyncResponse<NotesData>;

    assert.equal(status, 200);
    assert.deepEqual(asked, ['Consumed', 'Notes']);
    assert.deepEqual(response.outcome, { status: 'synced', records: 4 });
    assert.equal(response.totals.notes, 2);
  });

  test('still fetches a table that is stale when the other is fresh', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir, 'Notes'), notesCsv, 'utf8');
    const asked: string[] = [];
    const api = createApi({
      dataDir,
      fetchImpl: tableFetch({ Consumed: consumedCsv }, asked),
      credentials: testCredentials,
    });

    const { body } = await call(api, 'POST', '/api/notes/sync');

    assert.deepEqual(asked, ['Consumed']);
    assert.deepEqual((body as SyncResponse<NotesData>).outcome, { status: 'synced', records: 2 });
  });

  test('does not touch the cellar', async () => {
    const dataDir = await newDataDir();
    const asked: string[] = [];
    const api = createApi({
      dataDir,
      fetchImpl: tableFetch({ Consumed: consumedCsv, Notes: notesCsv }, asked),
      credentials: testCredentials,
    });

    await call(api, 'POST', '/api/notes/sync');

    assert.ok(!asked.includes('List'));
  });
});

describe('combineOutcomes', () => {
  const at = new Date();

  test('is synced if any table was, counting the rows fetched', () => {
    assert.deepEqual(
      combineOutcomes([
        { status: 'synced', records: 60, syncedAt: at },
        { status: 'skipped', ageMs: 1000, syncedAt: at },
      ]),
      { status: 'synced', records: 60 },
    );
  });

  test('when all were skipped, waits for the freshest table', () => {
    assert.deepEqual(
      combineOutcomes([
        { status: 'skipped', ageMs: 50_000, syncedAt: at },
        { status: 'skipped', ageMs: 10_000, syncedAt: at },
      ]),
      { status: 'skipped', ageMs: 10_000 },
    );
  });
});

describe('routing', () => {
  test('passes anything outside /api to the next handler', async () => {
    const dataDir = await newDataDir();
    const { nexted } = await call(createApi({ dataDir }), 'GET', '/index.html');
    assert.equal(nexted, true);
  });

  test('404s an unknown api route', async () => {
    const dataDir = await newDataDir();
    const { status } = await call(createApi({ dataDir }), 'GET', '/api/nope');
    assert.equal(status, 404);
  });
});
