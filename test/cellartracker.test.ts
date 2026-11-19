import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  buildExportUrl,
  CellarTrackerError,
  decodeLatin1,
  explainFailure,
  fetchTable,
  isExport,
  redact,
} from '../src/cellartracker.ts';

const credentials = { user: 'tom', password: 'p@ss word&1' };

describe('buildExportUrl', () => {
  test('targets the csv export for the given table', () => {
    const url = buildExportUrl(credentials, 'List');
    assert.equal(url.origin + url.pathname, 'https://www.cellartracker.com/xlquery.asp');
    assert.equal(url.searchParams.get('Format'), 'csv');
    assert.equal(url.searchParams.get('Table'), 'List');
  });

  test('escapes credentials that contain url-unsafe characters', () => {
    const url = buildExportUrl(credentials, 'Notes');
    assert.equal(url.searchParams.get('Password'), 'p@ss word&1');
    assert.ok(!url.toString().includes('p@ss word'));
  });
});

describe('redact', () => {
  test('hides the password but keeps the rest', () => {
    const redacted = redact(buildExportUrl(credentials, 'List'));
    assert.ok(!redacted.includes('ss+word'));
    assert.ok(!redacted.includes('p%40ss'));
    assert.ok(redacted.includes('Password=***'));
    assert.ok(redacted.includes('User=tom'));
  });
});

describe('decodeLatin1', () => {
  test('keeps accents intact', () => {
    // "Château" and "Télégraphe" as CellarTracker sends them: single-byte latin-1
    const bytes = Uint8Array.from([0x43, 0x68, 0xe2, 0x74, 0x65, 0x61, 0x75]);
    assert.equal(decodeLatin1(bytes), 'Château');
  });

  test('does not mangle bytes that are invalid utf-8', () => {
    const bytes = Uint8Array.from([0x54, 0xe9, 0x6c, 0xe9]);
    assert.equal(decodeLatin1(bytes), 'Télé');
    assert.ok(!decodeLatin1(bytes).includes('�'));
  });
});

describe('isExport', () => {
  test('accepts a header row', () => {
    assert.equal(isExport('iWine,Barcode,Location,Wine\n123,,,Something\n'), true);
  });

  test('rejects an html login page', () => {
    assert.equal(isExport('<html><body>Please sign in</body></html>'), false);
  });

  test('rejects an empty body', () => {
    assert.equal(isExport(''), false);
  });
});

describe('explainFailure', () => {
  test('reduces html to readable text', () => {
    const html = '<html><head><style>b{}</style></head><body><p>Invalid&nbsp;password.</p></body></html>';
    assert.equal(explainFailure(html), 'Invalid password.');
  });
});

describe('fetchTable', () => {
  const csv = 'iWine,Wine\n1001,Château Test\n';

  function latin1Response(body: string, init?: ResponseInit) {
    const bytes = Uint8Array.from([...body].map((char) => char.charCodeAt(0) & 0xff));
    return new Response(bytes, init);
  }

  test('returns the decoded csv', async () => {
    const result = await fetchTable(credentials, 'List', async () => latin1Response(csv));
    assert.equal(result, csv);
  });

  test('fails loudly on a non-ok status without leaking the password', async () => {
    const error = await fetchTable(credentials, 'List', async () =>
      latin1Response('nope', { status: 503, statusText: 'Service Unavailable' }),
    ).catch((caught: unknown) => caught);

    assert.ok(error instanceof CellarTrackerError);
    assert.match(error.message, /503/);
    assert.ok(!error.message.includes('p@ss'));
    assert.ok(!error.message.includes('p%40ss'));
  });

  test('treats a 200 html page as a credentials failure', async () => {
    const error = await fetchTable(credentials, 'List', async () =>
      latin1Response('<html><body>Login required</body></html>'),
    ).catch((caught: unknown) => caught);

    assert.ok(error instanceof CellarTrackerError);
    assert.match(error.message, /CT_USER and CT_PASSWORD/);
    assert.match(error.message, /Login required/);
  });
});
