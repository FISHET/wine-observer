import type { Cellar } from '../api.ts';
import { CELLAR_TABLES } from '../pageTables.ts';
import { columns } from '../columns.ts';
import { DataTable } from './DataTable.tsx';
import { SyncedLayout } from './SyncedLayout.tsx';
import { useSynced } from './useSynced.ts';

export function CellarPage() {
  const state = useSynced<Cellar>('/api/cellar', '/api/sync');
  const cellar = state.page;
  const counts = cellar?.totals;

  return (
    <SyncedLayout
      title="Cellar"
      tables={CELLAR_TABLES}
      state={state}
      summary={
        counts && counts.wines > 0
          ? `${counts.wines} wines · ${counts.bottles} bottles in stock · ${counts.pending} pending`
          : null
      }
      empty={
        <>
          No cellar data yet. Hit <strong>Sync</strong> to pull it from CellarTracker.
        </>
      }
    >
      {cellar && cellar.wines.length > 0 && (
        <DataTable
          rows={cellar.wines}
          columns={columns}
          rowKey={(w) => `${w.id}-${w.size}-${w.vintage ?? 'NV'}`}
          initialSort={{ key: 'producer', direction: 'asc' }}
        />
      )}
    </SyncedLayout>
  );
}
