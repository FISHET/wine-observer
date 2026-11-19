import type { Cellar } from '../api.ts';
import { asMoney } from '../table.ts';
import { Card } from './Card.tsx';
import { Link } from './router.tsx';
import { StatTile } from './StatTile.tsx';
import { useSynced } from './useSynced.ts';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** How much is in the cellar: bottles in stock and what they're worth. */
export function CellarValueCard() {
  const { page, phase, error } = useSynced<Cellar>('/api/cellar', '/api/sync');
  const totals = page?.totals;

  let body;
  if (phase === 'loading') {
    body = <p className="card-message">Loading…</p>;
  } else if (error || !totals) {
    body = <p className="card-message">{error ?? 'Could not load the cellar.'}</p>;
  } else if (totals.wines === 0) {
    body = (
      <p className="card-message">
        Nothing synced yet. <Link to="/cellar">Sync the cellar</Link> to see it here.
      </p>
    );
  } else {
    body = (
      <div className="stat-row">
        <StatTile
          label="Bottles in stock"
          value={totals.bottles.toLocaleString('en-GB')}
          note={totals.pending > 0 ? `${totals.pending} more on order` : undefined}
        />
        <StatTile
          label="Total value"
          value={asMoney(totals.value)}
          note={
            totals.unvaluedBottles > 0
              ? `Excludes ${plural(totals.unvaluedBottles, 'bottle')} with no valuation`
              : undefined
          }
        />
      </div>
    );
  }

  return <Card title="The cellar">{body}</Card>;
}
