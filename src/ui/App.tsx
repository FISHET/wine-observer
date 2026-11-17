import { useEffect, useState } from 'react';

import { duration, timeAgo } from '../time.ts';
import { useCellar } from './useCellar.ts';
import { WineTable } from './WineTable.tsx';

/** Re-renders every half minute so "3 minutes ago" doesn't go stale on screen. */
function useTicker(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
}

export function App() {
  const { cellar, phase, error, syncing, outcome, sync } = useCellar();
  useTicker();

  const syncedAt = cellar?.lastSyncedAt ? new Date(cellar.lastSyncedAt) : null;
  const counts = cellar?.totals;

  return (
    <main>
      <header>
        <div>
          <h1>Cellar</h1>
          <p className="summary">
            {counts && counts.wines > 0
              ? `${counts.wines} wines · ${counts.bottles} bottles in stock · ${counts.pending} pending`
              : phase === 'loading'
                ? 'Loading…'
                : 'Nothing synced yet'}
          </p>
        </div>

        <div className="sync">
          <span className="synced-at">
            {syncedAt ? `Last synced ${timeAgo(syncedAt)}` : 'Never synced'}
          </span>
          <button type="button" onClick={() => sync()} disabled={syncing || phase === 'loading'}>
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </header>

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}

      {outcome?.status === 'skipped' && !error && (
        <p className="notice">
          Already synced {syncedAt ? timeAgo(syncedAt) : 'recently'}. CellarTracker ask that the
          export isn&rsquo;t pulled too often, so the next one is due in{' '}
          {duration((cellar?.minimumAgeMs ?? 0) - outcome.ageMs)}.{' '}
          <button type="button" className="link" onClick={() => sync(true)} disabled={syncing}>
            Sync anyway
          </button>
        </p>
      )}

      {outcome?.status === 'synced' && !error && (
        <p className="notice">Synced {outcome.records} rows from CellarTracker.</p>
      )}

      {cellar && cellar.wines.length > 0 && <WineTable wines={cellar.wines} />}

      {phase === 'ready' && cellar?.wines.length === 0 && (
        <p className="notice">
          No cellar data yet. Hit <strong>Sync</strong> to pull it from CellarTracker.
        </p>
      )}
    </main>
  );
}
