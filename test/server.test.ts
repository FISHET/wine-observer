import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before, describe } from 'node:test';

import { createCellarServer, type CellarServer } from '../src/server.ts';
import { resolveWithin } from '../src/static.ts';
import { filePath } from '../src/sync.ts';

/** A GET with the path sent exactly as written. */
function rawGet(base: string, path: string): Promise<{ status: number; body: string }> {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    request({ hostname, port, path, method: 'GET', agent: false }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    })
      .on('error', reject)
      .end();
  });
}

describe('resolveWithin', () => {
  const root = join(tmpdir(), 'dist');

  test('resolves a path inside the root', () => {
    assert.equal(resolveWithin(root, '/assets/app.js'), join(root, 'assets', 'app.js'));
  });

  test('refuses to climb out of the root, however it is spelt', () => {
    for (const path of ['/../secret', '/assets/../../secret', '/%2e%2e/secret', '/..%2fsecret', '/..%5csecret']) {
      assert.equal(resolveWithin(root, path), null, path);
    }
  });

  test('refuses malformed escapes and NUL bytes', () => {
    assert.equal(resolveWithin(root, '/%E0%A4%A'), null);
    assert.equal(resolveWithin(root, '/index.html%00.js'), null);
  });
});

describe('the standalone server', () => {
  let cellar: CellarServer;
  let base: string;

  before(async () => {
    const root = await mkdtemp(join(tmpdir(), 'cellar-server-'));
    const dataDir = join(root, 'data');
    const distDir = join(root, 'dist');
    await mkdir(dataDir);
    await mkdir(join(distDir, 'assets'), { recursive: true });
    await writeFile(join(distDir, 'index.html'), '<!doctype html><title>Cellar</title>');
    await writeFile(join(distDir, 'assets', 'app-abc123.js'), 'console.log(1)');
    await writeFile(join(root, 'secret.txt'), 'do not serve');
    await writeFile(filePath(dataDir), 'iWine,Wine,Quantity,Pending\n1,Batailley,6,0\n');

    cellar = createCellarServer({ dataDir, distDir, nightlyAt: null, log: () => {} });
    await new Promise<void>((done) => cellar.server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${(cellar.server.address() as AddressInfo).port}`;
  });

  after(() => cellar.close());

  test('serves the API', async () => {
    const response = await fetch(`${base}/api/cellar`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.totals.bottles, 6);
    assert.equal(body.nightly, null, 'no schedule was configured');
  });

  test('serves the app, with fingerprinted assets cached hard', async () => {
    const page = await fetch(`${base}/`);
    assert.match(await page.text(), /<title>Cellar/);
    assert.equal(page.headers.get('cache-control'), 'no-cache');

    const asset = await fetch(`${base}/assets/app-abc123.js`);
    assert.equal(asset.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.match(asset.headers.get('cache-control') ?? '', /immutable/);
  });

  test('falls back to the app for a client-side route', async () => {
    const response = await fetch(`${base}/where/fridge`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<title>Cellar/);
  });

  test('404s a missing asset rather than handing back the page', async () => {
    assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404);
  });

  test('does not serve files from outside dist', async () => {
    // Sent raw: fetch would tidy the dots away before they reached the server.
    for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/..%5csecret.txt']) {
      const { status, body } = await rawGet(base, path);
      assert.ok(status === 400 || status === 404, `${path} gave ${status}`);
      assert.doesNotMatch(body, /do not serve/, path);
    }
  });
});

describe('the standalone server with a schedule', () => {
  test('reports the nightly status through the API', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'cellar-server-'));
    // Catch-up only fires if this runs in the last minute of the day, and even
    // then the stubbed fetch keeps it off the network.
    const cellar = createCellarServer({
      dataDir: join(root, 'data'),
      distDir: join(root, 'dist'),
      nightlyAt: '23:59',
      fetchImpl: (async () => new Response('')) as unknown as typeof fetch,
      log: () => {},
    });
    t.after(() => cellar.close());
    await new Promise<void>((done) => cellar.server.listen(0, '127.0.0.1', done));
    const port = (cellar.server.address() as AddressInfo).port;

    const body = await (await fetch(`http://127.0.0.1:${port}/api/cellar`)).json();

    assert.equal(body.nightly.at, '23:59');
    assert.ok(body.nightly.nextRunAt);
  });
});
