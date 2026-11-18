/**
 * Which of the last nightly run's failures a page should still mention.
 * Kept free of Node imports, because the browser bundle uses it.
 */
import type { Table } from './cellartracker.ts';
import type { NightlyRun, TableResult } from './nightly.ts';

export type Failure = Extract<TableResult, { status: 'failed' }>;

/**
 * Failures for the page's own tables, dropping any table synced successfully
 * since the run finished: a manual sync has fixed it, so stop nagging.
 */
export function outstandingFailures(
  lastRun: NightlyRun | null,
  tables: readonly Table[],
  syncedAt: Partial<Record<Table, string | null>>,
): Failure[] {
  if (!lastRun) return [];
  const finished = Date.parse(lastRun.finishedAt);

  return lastRun.tables.filter((result): result is Failure => {
    if (result.status !== 'failed' || !tables.includes(result.table)) return false;
    const synced = syncedAt[result.table];
    return !(synced && Date.parse(synced) > finished);
  });
}
