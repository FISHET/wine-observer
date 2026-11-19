import type { ConsumedData } from '../api.ts';
import { consumedColumns } from '../consumedColumns.ts';
import type { ConsumedTotals } from '../consumed.ts';
import { CONSUMED_TABLES } from '../pageTables.ts';
import { DataTable } from './DataTable.tsx';
import { Notice } from './Notice.tsx';
import { SyncedLayout } from './SyncedLayout.tsx';
import { useSynced } from './useSynced.ts';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function summarise(totals: ConsumedTotals, vivinoCheckIns: number | null): string {
  const parts = [plural(totals.wines, 'wine'), plural(totals.bottles, 'bottle')];
  if (vivinoCheckIns !== null) parts.push(`${totals.inBoth} in both CellarTracker and Vivino`);
  return parts.join(' · ');
}

export function ConsumedPage() {
  const state = useSynced<ConsumedData>('/api/consumed', '/api/consumed/sync');
  const page = state.page;

  return (
    <SyncedLayout
      title="Consumed"
      tables={CONSUMED_TABLES}
      state={state}
      summary={page && page.wines.length > 0 ? summarise(page.totals, page.vivinoCheckIns) : null}
      empty={
        <>
          Nothing consumed yet. Hit <strong>Sync</strong> to pull it from CellarTracker, and save a
          Vivino export as <code>data/vivino.csv</code> to include it.
        </>
      }
    >
      {page && page.wines.length > 0 && (
        <>
          {page.vivinoCheckIns === null && (
            <Notice remember={`consumed-no-vivino@${page.lastSyncedAt}`}>
              No Vivino export found. Save Vivino&rsquo;s full wine list as{' '}
              <code>data/vivino.csv</code> to include it.
            </Notice>
          )}
          {page.vivinoUnidentified > 0 && (
            <Notice remember={`consumed-vivino-unidentified@${page.lastSyncedAt}`}>
              {page.vivinoUnidentified === 1
                ? '1 Vivino check-in is'
                : `${page.vivinoUnidentified} Vivino check-ins are`}{' '}
              left out because they don&rsquo;t name a wine: label scans Vivino never identified.
            </Notice>
          )}
          {page.vivinoCheckIns !== null && page.vivinoWishlisted === null && (
            <Notice remember={`consumed-no-wishlist@${page.lastSyncedAt}`}>
              No Vivino wishlist export found. Vivino&rsquo;s full wine list includes wishlisted
              wines, so save the wishlist as <code>data/wishlisted.csv</code> to leave them out.
            </Notice>
          )}
          {page.vivinoWishlisted !== null && page.vivinoWishlisted > 0 && (
            <Notice remember={`consumed-wishlisted@${page.lastSyncedAt}`}>
              {page.vivinoWishlisted === 1
                ? '1 Vivino row is'
                : `${page.vivinoWishlisted} Vivino rows are`}{' '}
              left out as wishlist entries: on <code>data/wishlisted.csv</code>, with no rating or
              review.
            </Notice>
          )}
          {page.unmappedStyles.length > 0 && (
            <details className="notice">
              <summary>
                {page.unmappedStyles.length} Vivino{' '}
                {page.unmappedStyles.length === 1 ? 'style has' : 'styles have'} no grape yet. Add{' '}
                {page.unmappedStyles.length === 1 ? 'it' : 'them'} to <code>data/grape-styles.json</code>.
              </summary>
              <ul>
                {page.unmappedStyles.map((style) => (
                  <li key={style}>{style}</li>
                ))}
              </ul>
            </details>
          )}
          <DataTable
            rows={page.wines}
            columns={consumedColumns}
            rowKey={(w) => w.key}
            initialSort={{ key: 'lastDate', direction: 'desc' }}
          />
        </>
      )}
    </SyncedLayout>
  );
}
