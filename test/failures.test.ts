import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { outstandingFailures } from '../src/failures.ts';
import type { NightlyRun } from '../src/nightly.ts';

const run: NightlyRun = {
  startedAt: '2026-11-18T03:00:00.000Z',
  finishedAt: '2026-11-18T03:00:05.000Z',
  tables: [
    { table: 'List', status: 'failed', error: 'List broke' },
    { table: 'Notes', status: 'synced', records: 30 },
    { table: 'Consumed', status: 'failed', error: 'Consumed broke' },
  ],
};

describe('outstandingFailures', () => {
  test('only reports the tables the page reads', () => {
    assert.deepEqual(
      outstandingFailures(run, ['Consumed', 'Notes'], {}).map((f) => f.table),
      ['Consumed'],
    );
    assert.deepEqual(
      outstandingFailures(run, ['List'], {}).map((f) => f.table),
      ['List'],
    );
  });

  test('drops a failure once that table has synced since', () => {
    const failures = outstandingFailures(run, ['List', 'Consumed'], {
      List: '2026-11-18T09:00:00.000Z',
      Consumed: '2026-11-17T22:00:00.000Z',
    });
    assert.deepEqual(
      failures.map((f) => f.table),
      ['Consumed'],
    );
  });

  test('is empty with no run', () => {
    assert.deepEqual(outstandingFailures(null, ['List'], {}), []);
  });
});
