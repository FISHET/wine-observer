import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import type { Table } from '../src/cellartracker.ts';
import { CellarTrackerError } from '../src/cellartracker.ts';
import {
  nextOccurrence,
  parseTimeOfDay,
  runNightly,
  sameLocalDay,
  scheduleNightly,
  type NightlyRun,
  type Timers,
} from '../src/nightly.ts';
import type { SyncOutcome, SyncRequest } from '../src/sync.ts';

// Local-time constructors, so these hold whatever TZ the tests run in.
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const threeAm = { hour: 3, minute: 0 };

describe('parseTimeOfDay', () => {
  test('reads hours and minutes', () => {
    assert.deepEqual(parseTimeOfDay('03:00'), threeAm);
    assert.deepEqual(parseTimeOfDay('3:30'), { hour: 3, minute: 30 });
    assert.deepEqual(parseTimeOfDay('23:59'), { hour: 23, minute: 59 });
  });

  test('refuses anything it would have to guess at', () => {
    for (const bad of ['', '3', '3am', '24:00', '03:60', '03:0', 'off']) {
      assert.throws(() => parseTimeOfDay(bad), /like 03:00/, bad);
    }
  });
});

describe('nextOccurrence', () => {
  test('is later today when the time has not come yet', () => {
    assert.deepEqual(nextOccurrence(local(2026, 11, 17, 1, 0), threeAm), local(2026, 11, 17, 3));
  });

  test('is tomorrow once the time has passed', () => {
    assert.deepEqual(nextOccurrence(local(2026, 11, 17, 20, 0), threeAm), local(2026, 11, 18, 3));
  });

  test('is tomorrow when it is exactly the time, so a run never schedules itself again', () => {
    assert.deepEqual(nextOccurrence(local(2026, 11, 17, 3, 0), threeAm), local(2026, 11, 18, 3));
  });

  test('rolls over the end of a month and a year', () => {
    assert.deepEqual(nextOccurrence(local(2026, 12, 31, 12), threeAm), local(2027, 1, 1, 3));
  });

  test('keeps the wall-clock time across the spring and autumn clock changes', () => {
    const spring = nextOccurrence(local(2027, 3, 27, 12), threeAm);
    assert.equal(spring.getDate(), 28);
    assert.equal(spring.getHours(), 3);

    const autumn = nextOccurrence(local(2026, 10, 24, 12), threeAm);
    assert.equal(autumn.getDate(), 25);
    assert.equal(autumn.getHours(), 3);
  });
});

describe('sameLocalDay', () => {
  test('compares calendar days, not 24-hour windows', () => {
    assert.equal(sameLocalDay(local(2026, 11, 17, 0, 1), local(2026, 11, 17, 23, 59)), true);
    assert.equal(sameLocalDay(local(2026, 11, 16, 23, 59), local(2026, 11, 17, 0, 1)), false);
  });
});

/** A syncer that records what it was asked and answers from a script. */
function fakeSyncer(answer: (table: Table) => SyncOutcome | Error) {
  const asked: SyncRequest[] = [];
  const syncer = async (request: SyncRequest = {}) => {
    asked.push(request);
    const result = answer(request.table ?? 'List');
    if (result instanceof Error) throw result;
    return result;
  };
  return { syncer, asked };
}

const synced = (records: number): SyncOutcome => ({ status: 'synced', records, syncedAt: new Date() });

describe('runNightly', () => {
  const now = () => local(2026, 11, 18, 3, 0);

  test('syncs every table not synced today', async () => {
    const { syncer, asked } = fakeSyncer(() => synced(10));

    const run = await runNightly({
      tables: ['List', 'Notes'],
      syncer,
      lastSyncedAt: async () => local(2026, 11, 17, 9, 0),
      now,
    });

    assert.deepEqual(asked.map((r) => r.table), ['List', 'Notes']);
    assert.deepEqual(run.tables, [
      { table: 'List', status: 'synced', records: 10 },
      { table: 'Notes', status: 'synced', records: 10 },
    ]);
  });

  test('leaves a table alone if it was synced since midnight', async () => {
    const { syncer, asked } = fakeSyncer(() => synced(10));

    const run = await runNightly({
      tables: ['List', 'Notes'],
      syncer,
      lastSyncedAt: async (table) => (table === 'List' ? local(2026, 11, 18, 0, 30) : null),
      now,
    });

    assert.deepEqual(asked.map((r) => r.table), ['Notes']);
    assert.deepEqual(run.tables[0], { table: 'List', status: 'skipped', reason: 'synced today' });
  });

  test('never forces, so the hourly limit still protects CellarTracker', async () => {
    const { syncer, asked } = fakeSyncer(() => synced(1));
    await runNightly({ tables: ['List'], syncer, lastSyncedAt: async () => null, now });
    assert.notEqual(asked[0]?.force, true);
  });

  test('carries on to the next table when one fails, and records why', async () => {
    const { syncer, asked } = fakeSyncer((table) =>
      table === 'List' ? new CellarTrackerError('You are not logged in') : synced(4),
    );

    const run = await runNightly({ tables: ['List', 'Notes'], syncer, lastSyncedAt: async () => null, now });

    assert.equal(asked.length, 2);
    assert.deepEqual(run.tables, [
      { table: 'List', status: 'failed', error: 'You are not logged in' },
      { table: 'Notes', status: 'synced', records: 4 },
    ]);
  });

  test('hides the detail of an unexpected error, which might hold anything', async (t) => {
    t.mock.method(console, 'error', () => {});
    const { syncer } = fakeSyncer(() => new Error('https://x/?Password=hunter2'));

    const run = await runNightly({ tables: ['List'], syncer, lastSyncedAt: async () => null, now });
    const result = run.tables[0]!;

    assert.equal(result.status, 'failed');
    assert.ok(result.status === 'failed' && !result.error.includes('hunter2'));
  });
});

/** Timers you fire by hand. Each test sees exactly what was scheduled and when. */
function fakeTimers() {
  const pending: Array<{ callback: () => void; ms: number; cleared: boolean }> = [];
  const timers: Timers = {
    setTimeout: (callback, ms) => {
      const entry = { callback, ms, cleared: false };
      pending.push(entry);
      return entry;
    },
    clearTimeout: (handle) => {
      (handle as { cleared: boolean }).cleared = true;
    },
  };
  return {
    timers,
    last: () => pending.at(-1)!,
    count: () => pending.length,
    fireLast: () => pending.at(-1)!.callback(),
  };
}

const runResult = (status: 'synced' | 'failed'): NightlyRun => ({
  startedAt: '',
  finishedAt: '',
  tables: [
    status === 'synced'
      ? { table: 'List', status, records: 1 }
      : { table: 'List', status, error: 'nope' },
  ],
});

const HOUR = 60 * 60 * 1000;

describe('scheduleNightly', () => {
  test('waits for tonight when started before the run time', () => {
    const clock = fakeTimers();
    const schedule = scheduleNightly({
      at: '03:00',
      run: async () => runResult('synced'),
      now: () => local(2026, 11, 18, 1, 0),
      timers: clock.timers,
    });

    assert.equal(clock.last().ms, 2 * HOUR);
    assert.equal(schedule.status().nextRunAt, local(2026, 11, 18, 3).toISOString());
  });

  test('catches up straight away when started after the run time', () => {
    const clock = fakeTimers();
    scheduleNightly({
      at: '03:00',
      run: async () => runResult('synced'),
      now: () => local(2026, 11, 18, 9, 0),
      timers: clock.timers,
    });

    assert.equal(clock.last().ms, 0);
  });

  test('waits for tomorrow instead when catch-up is off', () => {
    const clock = fakeTimers();
    scheduleNightly({
      at: '03:00',
      run: async () => runResult('synced'),
      catchUp: false,
      now: () => local(2026, 11, 18, 9, 0),
      timers: clock.timers,
    });

    assert.equal(clock.last().ms, 18 * HOUR);
  });

  test('schedules the next night after a good run, and reports it', async () => {
    const clock = fakeTimers();
    let time = local(2026, 11, 18, 1, 0);
    const schedule = scheduleNightly({
      at: '03:00',
      run: async () => runResult('synced'),
      now: () => time,
      timers: clock.timers,
    });

    time = local(2026, 11, 18, 3, 0);
    clock.fireLast();
    await schedule.idle();

    assert.equal(clock.count(), 2);
    assert.equal(clock.last().ms, 24 * HOUR);
    assert.equal(schedule.status().lastRun?.tables[0]?.status, 'synced');
  });

  test('retries a failed run once, an hour later, then goes back to nightly', async () => {
    const clock = fakeTimers();
    let time = local(2026, 11, 18, 1, 0);
    const schedule = scheduleNightly({
      at: '03:00',
      run: async () => runResult('failed'),
      now: () => time,
      timers: clock.timers,
    });

    time = local(2026, 11, 18, 3, 0);
    clock.fireLast();
    await schedule.idle();
    assert.equal(clock.last().ms, HOUR, 'first failure should retry in an hour');

    time = local(2026, 11, 18, 4, 0);
    clock.fireLast();
    await schedule.idle();
    assert.equal(clock.last().ms, 23 * HOUR, 'second failure should wait for the next night');
  });

  test('stop cancels the pending run', () => {
    const clock = fakeTimers();
    const schedule = scheduleNightly({
      at: '03:00',
      run: async () => runResult('synced'),
      now: () => local(2026, 11, 18, 1, 0),
      timers: clock.timers,
    });

    schedule.stop();

    assert.equal(clock.last().cleared, true);
    assert.equal(schedule.status().nextRunAt, null);
  });

  test('a bad time fails at startup rather than silently never running', () => {
    assert.throws(() => scheduleNightly({ at: '3am', run: async () => runResult('synced') }));
  });
});
