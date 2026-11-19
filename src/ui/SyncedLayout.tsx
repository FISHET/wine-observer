import { useEffect, useState, type ReactNode } from 'react';

import type { SyncedPage } from '../api.ts';
import type { Table } from '../cellartracker.ts';
import { outstandingFailures } from '../failures.ts';
import { pageTitle } from '../pageTitle.ts';
import { duration, timeAgo } from '../time.ts';
import { Notice } from './Notice.tsx';
import { Link } from './router.tsx';
import type { SyncedState } from './useSynced.ts';

/** Re-renders every half minute so "3 minutes ago" doesn't go stale on screen. */
function useTicker(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
}

/** Sets the browser tab's title; null for the home page. See pageTitle. */
export function useTitle(page: string | null): void {
  useEffect(() => {
    document.title = pageTitle(page);
  }, [page]);
}

type Props<Page extends SyncedPage> = {
  title: string;
  /** Shown under the title once there is data. */
  summary: string | null;
  /** The CellarTracker tables behind the page, for nightly-failure warnings. */
  tables: readonly Table[];
  state: SyncedState<Page>;
  /** Shown before the first sync. */
  empty: ReactNode;
  children: ReactNode;
};

/**
 * The frame every synced page shares: a way home, the sync button and its
 * explanations, and the page's own content.
 */
export function SyncedLayout<Page extends SyncedPage>({
  title,
  summary,
  tables,
  state,
  empty,
  children,
}: Props<Page>) {
  const { page, phase, error, syncing, outcome, syncs, sync } = state;
  useTicker();
  useTitle(title);

  const syncedAt = page?.lastSyncedAt ? new Date(page.lastSyncedAt) : null;
  const nightly = page?.nightly ?? null;
  const lastRun = nightly?.lastRun ?? null;
  const failures = outstandingFailures(lastRun, tables, page?.syncedAt ?? {});

  return (
    <main>
      <nav>
        <Link to="/" className="back">
          ← Home
        </Link>
      </nav>

      <header>
        <div>
          <h1>{title}</h1>
          <p className="summary">
            {summary ?? (phase === 'loading' ? 'Loading…' : 'Nothing synced yet')}
          </p>
        </div>

        <div className="sync">
          <span className="synced-at">
            {syncedAt ? `Last synced ${timeAgo(syncedAt)}` : 'Never synced'}
            {nightly && (
              <>
                <br />
                Syncs automatically at {nightly.at}
              </>
            )}
          </span>
          <button type="button" onClick={() => sync()} disabled={syncing || phase === 'loading'}>
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </header>

      {error && (
        <Notice key={`error-${syncs}`} error>
          {error}
        </Notice>
      )}

      {failures.length > 0 && lastRun && (
        <Notice key={`nightly-${lastRun.startedAt}`} error>
          The automatic sync {timeAgo(new Date(lastRun.startedAt))} failed for{' '}
          {failures.map((f) => f.table).join(' and ')}: {failures[0]!.error}
        </Notice>
      )}

      {outcome?.status === 'skipped' && !error && (
        <Notice key={`skipped-${syncs}`}>
          Already synced {syncedAt ? timeAgo(syncedAt) : 'recently'}. CellarTracker ask that the
          export isn&rsquo;t pulled too often, so the next one is due in{' '}
          {duration((page?.minimumAgeMs ?? 0) - outcome.ageMs)}.{' '}
          <button type="button" className="link" onClick={() => sync(true)} disabled={syncing}>
            Sync anyway
          </button>
        </Notice>
      )}

      {outcome?.status === 'synced' && !error && (
        <Notice key={`synced-${syncs}`}>Synced {outcome.records} rows from CellarTracker.</Notice>
      )}

      {phase === 'ready' && summary === null ? <p className="notice">{empty}</p> : children}
    </main>
  );
}
