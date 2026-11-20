import type { Cellar } from '../api.ts';
import { breakdown } from '../breakdown.ts';
import { asMoney } from '../table.ts';
import { BreakdownLists } from './BreakdownLists.tsx';
import { Card } from './Card.tsx';
import { Link } from './router.tsx';
import { StatTile } from './StatTile.tsx';
import { useSynced } from './useSynced.ts';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * What's in the cellar: bottles in stock, what they're worth, and the styles,
 * regions and grapes that make it up. Laid out like the favourites card
 * beside it, row for row.
 */
export function CellarValueCard() {
  const { page, phase, error } = useSynced<Cellar>('/api/cellar', '/api/sync');
  const totals = page?.totals;

  if (phase === 'loading') {
    return <Card title="The cellar"><p className="card-message">Loading…</p></Card>;
  }
  if (error || !page || !totals) {
    return (
      <Card title="The cellar">
        <p className="card-message">{error ?? 'Could not load the cellar.'}</p>
      </Card>
    );
  }
  if (totals.wines === 0) {
    return (
      <Card title="The cellar">
        <p className="card-message">
          Nothing synced yet. <Link to="/cellar">Sync the cellar</Link> to see it here.
        </p>
      </Card>
    );
  }

  // Bottles held, including bond; pending ones aren't in the cellar yet.
  const held = breakdown(page.wines.map((wine) => ({ ...wine, bottles: wine.inStock })));
  return (
    <Card title="The cellar">
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
      <BreakdownLists breakdown={held} />
      <p className="stat-note">By bottles in stock, including any in bond.</p>
    </Card>
  );
}
