import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { duration, timeAgo } from '../src/time.ts';

const now = new Date('2026-11-17T20:00:00Z');
const ago = (ms: number) => timeAgo(new Date(now.getTime() - ms), now);

describe('timeAgo', () => {
  test('says just now for the last minute', () => {
    assert.equal(ago(0), 'just now');
    assert.equal(ago(59_000), 'just now');
  });

  test('counts minutes', () => {
    assert.equal(ago(60_000), '1 minute ago');
    assert.equal(ago(20 * 60_000), '20 minutes ago');
  });

  test('switches to hours', () => {
    assert.equal(ago(60 * 60_000), '1 hour ago');
    assert.equal(ago(5 * 60 * 60_000), '5 hours ago');
  });

  test('switches to days', () => {
    assert.equal(ago(24 * 60 * 60_000), 'yesterday');
    assert.equal(ago(3 * 24 * 60 * 60_000), '3 days ago');
  });

  test('rounds down, so 119 minutes is an hour ago not two', () => {
    assert.equal(ago(119 * 60_000), '1 hour ago');
  });
});

describe('duration', () => {
  test('reads in minutes', () => {
    assert.equal(duration(40 * 60_000), '40 minutes');
    assert.equal(duration(60_000), '1 minute');
  });

  test('never says zero, since a wait of seconds is still a wait', () => {
    assert.equal(duration(1000), '1 minute');
    assert.equal(duration(0), '1 minute');
  });

  test('reads in hours once it is long enough', () => {
    assert.equal(duration(2 * 60 * 60_000), '2 hours');
  });
});
