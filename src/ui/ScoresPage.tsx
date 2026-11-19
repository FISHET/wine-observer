import type { ScoresData } from '../api.ts';
import { SCORES_TABLES } from '../pageTables.ts';
import type { ScoresTotals } from '../scores.ts';
import { scoresColumns } from '../scoresColumns.ts';
import { DataTable } from './DataTable.tsx';
import { Notice } from './Notice.tsx';
import { SyncedLayout } from './SyncedLayout.tsx';
import { useSynced } from './useSynced.ts';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function summarise(totals: ScoresTotals): string {
  const parts = [plural(totals.tastings, 'tasting'), plural(totals.wines, 'wine')];
  if (totals.tastedMoreThanOnce > 0) parts.push(`${totals.tastedMoreThanOnce} tasted more than once`);
  if (totals.averageScore !== null) parts.push(`average ${totals.averageScore.toFixed(1)}`);
  return parts.join(' · ');
}

export function ScoresPage() {
  const state = useSynced<ScoresData>('/api/scores', '/api/scores/sync');
  const page = state.page;

  return (
    <SyncedLayout
      title="Scores"
      tables={SCORES_TABLES}
      state={state}
      summary={page && page.tastings.length > 0 ? summarise(page.totals) : null}
      empty={
        <>
          No tastings yet. Hit <strong>Sync</strong> to pull notes from CellarTracker, and save a
          Vivino export as <code>data/vivino.csv</code> to include its ratings.
        </>
      }
    >
      {page && page.tastings.length > 0 && (
        <>
          {page.vivinoCheckIns === null && (
            <Notice>
              No Vivino export found. Save Vivino&rsquo;s full wine list as{' '}
              <code>data/vivino.csv</code> to include its ratings.
            </Notice>
          )}
          {page.vivinoUnrated > 0 && (
            <Notice>
              {page.vivinoUnrated === 1
                ? '1 Vivino check-in has'
                : `${page.vivinoUnrated} Vivino check-ins have`}{' '}
              no rating or review, so {page.vivinoUnrated === 1 ? 'it is' : 'they are'} counted on
              Consumed but not listed here. Vivino scores are converted from stars as 50 + 10 × stars.
            </Notice>
          )}
          <DataTable
            rows={page.tastings}
            columns={scoresColumns}
            rowKey={(t) => t.key}
            initialSort={{ key: 'score', direction: 'desc' }}
          />
        </>
      )}
    </SyncedLayout>
  );
}
