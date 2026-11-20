import type { ConsumedData } from '../api.ts';
import { breakdown } from '../breakdown.ts';
import { BreakdownLists } from './BreakdownLists.tsx';
import { Card } from './Card.tsx';
import { Link } from './router.tsx';
import { StatTile } from './StatTile.tsx';
import { useSynced } from './useSynced.ts';

/**
 * What's been drunk: how many bottles, and the styles, regions and grapes
 * drunk most. Laid out like the cellar card beside it, row for row.
 */
export function FavouritesCard() {
  const { page, phase, error } = useSynced<ConsumedData>('/api/consumed', '/api/consumed/sync');

  if (phase === 'loading') {
    return <Card title="Favourites"><p className="card-message">Loading…</p></Card>;
  }
  if (error || !page) {
    return (
      <Card title="Favourites">
        <p className="card-message">{error ?? 'Could not load what has been consumed.'}</p>
      </Card>
    );
  }
  if (page.wines.length === 0) {
    return (
      <Card title="Favourites">
        <p className="card-message">
          Nothing consumed yet. <Link to="/consumed">Sync it</Link> to see it here.
        </p>
      </Card>
    );
  }

  const drunk = breakdown(page.wines);
  return (
    <Card title="Favourites">
      <div className="stat-row">
        <StatTile
          label="Bottles consumed"
          value={drunk.bottles.toLocaleString('en-GB')}
          note={`${page.totals.wines.toLocaleString('en-GB')} different wines`}
        />
      </div>
      <BreakdownLists breakdown={drunk} />
      <p className="stat-note">By bottles drunk.</p>
    </Card>
  );
}
