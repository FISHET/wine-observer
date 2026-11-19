import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { isDismissed, MAX_REMEMBERED, rememberDismissed } from '../src/ui/dismissals.ts';

/** An in-memory stand-in for localStorage. */
function memoryStore() {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    items,
  };
}

describe('dismissed notices', () => {
  test('stay dismissed for the same key', () => {
    const store = memoryStore();
    rememberDismissed('consumed-wishlisted@2026-11-19T00:14:00Z', store);
    assert.equal(isDismissed('consumed-wishlisted@2026-11-19T00:14:00Z', store), true);
  });

  test('show again after a sync changes the key', () => {
    const store = memoryStore();
    rememberDismissed('consumed-wishlisted@2026-11-19T00:14:00Z', store);
    assert.equal(isDismissed('consumed-wishlisted@2026-11-20T03:00:00Z', store), false);
  });

  test('keep only the most recent keys', () => {
    const store = memoryStore();
    for (let i = 0; i <= MAX_REMEMBERED; i++) rememberDismissed(`notice-${i}`, store);
    assert.equal(isDismissed('notice-0', store), false, 'the oldest is forgotten');
    assert.equal(isDismissed(`notice-${MAX_REMEMBERED}`, store), true);
  });

  test('cope with storage that is missing, corrupt or refuses writes', () => {
    assert.equal(isDismissed('x', null), false);
    rememberDismissed('x', null);

    const corrupt = memoryStore();
    corrupt.items.set('dismissed-notices', '{not json');
    assert.equal(isDismissed('x', corrupt), false);

    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    assert.doesNotThrow(() => rememberDismissed('x', full));
  });
});
