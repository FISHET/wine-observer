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
  type ConsumedData,
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
  '2,200,2026,9,26,Drank,0,2022,Château de Beaucastel Châteauneuf-du-Pape\n';

const notesCsv =
  'iNote,iWine,TastingDate,Rating,TastingNotes,Vintage,Wine,Producer\n' +
  '500,100,15/11/2026,82,Thin.,2016,Château Larrivet-Haut-Brion,Château Larrivet-Haut-Brion\n' +
  '501,200,27/09/2026,93,Written up the next morning.,2022,Château de Beaucastel Châteauneuf-du-Pape,Château de Beaucastel\n' +
  '502,300,07/11/2026,85,A tasting.,2019,Psi Ribera del Duero,Psi\n';

const purchasesCsv =
  'iWine,Producer,Wine\n' +
  '100,Château Larrivet-Haut-Brion,Château Larrivet-Haut-Brion\n' +
  '200,Château de Beaucastel,Château de Beaucastel Châteauneuf-du-Pape\n';

const vivinoCsv =
  'Winery,Wine name,Vintage,Region,Country,Your rating,Scan date,Wine type,Regional wine style\n' +
  'Château de Beaucastel,Châteauneuf-du-Pape,2022,Châteauneuf-du-Pape,France,4.5,,Red Wine,Southern Rhône Red\n' +
  'Dominus,Othello,2019,Napa Valley,United States,4.3,,Red Wine,Napa Valley Bordeaux Blend\n' +
  'Dominus,Othello,2019,Napa Valley,United States,4.1,,Red Wine,Napa Valley Bordeaux Blend\n';

/** Answers each CellarTracker table with its own CSV, latin-1 encoded like the real thing. */
function tableFetch(tables: Record<string, string>, asked: string[] = []) {
  return (async (url: URL) => {
    const table = new URL(url).searchParams.get('Table')!;
    asked.push(table);
    const body = tables[table] ?? '';
    return new Response(Uint8Array.from([...body].map((c) => c.charCodeAt(0) & 0xff)));
  }) as unknown as typeof fetch;
}

describe('GET /api/consumed', () => {
  test('lists each wine once, counting its check-ins', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir, 'Consumed'), consumedCsv, 'utf8');
    await writeFile(filePath(dataDir, 'Notes'), notesCsv, 'utf8');

    const { status, body } = await call(createApi({ dataDir }), 'GET', '/api/consumed');
    const page = body as ConsumedData;

    assert.equal(status, 200);
    // Two bottles with their notes, and one note with no bottle.
    assert.deepEqual(
      page.wines.map((w) => [w.wine, w.bottles]).sort(),
      [
        ['Château Larrivet-Haut-Brion', 1],
        ['Château de Beaucastel Châteauneuf-du-Pape', 1],
        ['Psi Ribera del Duero', 1],
      ],
    );
    assert.equal(page.vivinoCheckIns, null, 'no Vivino export saved');
    assert.equal(
      page.wines.find((w) => w.wine === 'Château Larrivet-Haut-Brion')!.producer,
      'Château Larrivet-Haut-Brion',
      'from the note, as Consumed has no Producer column',
    );
    assert.ok(page.syncedAt.Consumed && page.syncedAt.Notes);
  });

  test('merges the Vivino export in', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir, 'Consumed'), consumedCsv, 'utf8');
    await writeFile(filePath(dataDir, 'Notes'), notesCsv, 'utf8');
    await writeFile(join(dataDir, 'vivino.csv'), vivinoCsv, 'utf8');

    const { body } = await call(createApi({ dataDir }), 'GET', '/api/consumed');
    const page = body as ConsumedData;
    const beaucastel = page.wines.find((w) => w.wine === 'Château de Beaucastel Châteauneuf-du-Pape')!;
    const othello = page.wines.find((w) => w.wine === 'Dominus Othello')!;

    assert.equal(page.vivinoCheckIns, 3);
    assert.equal(page.vivinoUnidentified, 0);
    assert.deepEqual(beaucastel.counts, { CellarTracker: 1, Vivino: 1 });
    assert.equal(beaucastel.bottles, 1, 'one bottle, logged in both apps');
    assert.equal(othello.bottles, 2, 'two check-ins in Vivino');
    assert.equal(page.totals.inBoth, 1);
  });

  test('takes producers from the Purchase table, which Consumed lacks', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir, 'Consumed'), consumedCsv, 'utf8');
    await writeFile(filePath(dataDir, 'Purchase'), purchasesCsv, 'utf8');

    const { body } = await call(createApi({ dataDir }), 'GET', '/api/consumed');
    const larrivet = (body as ConsumedData).wines.find((w) => w.wine === 'Château Larrivet-Haut-Brion')!;

    assert.equal(larrivet.producer, 'Château Larrivet-Haut-Brion');
  });

  test('maps Vivino styles to grapes from data/grape-styles.json', async () => {
    const dataDir = await newDataDir();
    await writeFile(join(dataDir, 'vivino.csv'), vivinoCsv, 'utf8');
    await writeFile(join(dataDir, 'grape-styles.json'), '{ "Napa Valley Bordeaux Blend": "Red Bordeaux Blend" }', 'utf8');

    const { body } = await call(createApi({ dataDir }), 'GET', '/api/consumed');
    const page = body as ConsumedData;

    assert.equal(page.wines.find((w) => w.wine === 'Dominus Othello')!.grape, 'Red Bordeaux Blend');
    assert.deepEqual(page.unmappedStyles, ['Southern Rhône Red']);
  });

  test('says what is wrong with a broken grape-styles.json', async () => {
    const dataDir = await newDataDir();
    await writeFile(join(dataDir, 'grape-styles.json'), '{ "French Champagne": }', 'utf8');

    const { status, body } = await call(createApi({ dataDir }), 'GET', '/api/consumed');

    assert.equal(status, 500);
    assert.match(body.error, /grape-styles\.json is not valid JSON/);
  });

  test('is empty rather than broken before the first sync', async () => {
    const dataDir = await newDataDir();

    const { body } = await call(createApi({ dataDir }), 'GET', '/api/consumed');

    assert.deepEqual((body as ConsumedData).wines, []);
    assert.equal((body as ConsumedData).lastSyncedAt, null);
  });
});

describe('POST /api/consumed/sync', () => {
  test('pulls Consumed, Notes and Purchase, and returns the page', async () => {
    const dataDir = await newDataDir();
    const asked: string[] = [];
    const api = createApi({
      dataDir,
      fetchImpl: tableFetch({ Consumed: consumedCsv, Notes: notesCsv, Purchase: purchasesCsv }, asked),
      credentials: testCredentials,
    });

    const { status, body } = await call(api, 'POST', '/api/consumed/sync');
    const response = body as SyncResponse<ConsumedData>;

    assert.equal(status, 200);
    assert.deepEqual(asked, ['Consumed', 'Notes', 'Purchase']);
    assert.deepEqual(response.outcome, { status: 'synced', records: 7 });
    assert.equal(response.totals.wines, 3);
    assert.ok(response.wines.every((w) => w.producer), 'every wine has a producer');
  });

  test('still fetches a table that is stale when the others are fresh', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir, 'Notes'), notesCsv, 'utf8');
    await writeFile(filePath(dataDir, 'Purchase'), purchasesCsv, 'utf8');
    const asked: string[] = [];
    const api = createApi({
      dataDir,
      fetchImpl: tableFetch({ Consumed: consumedCsv }, asked),
      credentials: testCredentials,
    });

    const { body } = await call(api, 'POST', '/api/consumed/sync');

    assert.deepEqual(asked, ['Consumed']);
    assert.deepEqual((body as SyncResponse<ConsumedData>).outcome, { status: 'synced', records: 2 });
  });

  test('picks up a replaced Vivino export, even when CellarTracker is skipped', async () => {
    const dataDir = await newDataDir();
    await writeFile(filePath(dataDir, 'Consumed'), consumedCsv, 'utf8');
    await writeFile(filePath(dataDir, 'Notes'), notesCsv, 'utf8');
    await writeFile(filePath(dataDir, 'Purchase'), purchasesCsv, 'utf8');
    const api = createApi({ dataDir, fetchImpl: tableFetch({}), credentials: testCredentials });

    const before = (await call(api, 'POST', '/api/consumed/sync')).body as SyncResponse<ConsumedData>;
    await writeFile(join(dataDir, 'vivino.csv'), vivinoCsv, 'utf8');
    const after = (await call(api, 'POST', '/api/consumed/sync')).body as SyncResponse<ConsumedData>;

    assert.equal(after.outcome.status, 'skipped', 'CellarTracker was synced moments ago');
    assert.equal(before.vivinoCheckIns, null);
    assert.equal(after.vivinoCheckIns, 3, 'the new file was read');
  });

  test('does not touch the cellar', async () => {
    const dataDir = await newDataDir();
    const asked: string[] = [];
    const api = createApi({
      dataDir,
      fetchImpl: tableFetch({ Consumed: consumedCsv, Notes: notesCsv }, asked),
      credentials: testCredentials,
    });

    await call(api, 'POST', '/api/consumed/sync');

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
