import type { ConsumedData } from '../api.ts';
import { favourites, type Tally } from '../favourites.ts';
import { Card } from './Card.tsx';
import { Flag } from './Flag.tsx';
import { Link } from './router.tsx';
import { useSynced } from './useSynced.ts';

const percent = (part: number, whole: number) => (whole === 0 ? 0 : (part / whole) * 100);

type ListProps = { label: string; tallies: Tally[]; total: number; flags?: boolean };

/**
 * A meter list: name, bar and figure per row. Each bar is that entry's share
 * of every bottle consumed, so the lists share one scale.
 */
function TallyList({ label, tallies, total, flags = false }: ListProps) {
  return (
    <div className="tally">
      <h3 className="tally-label">{label}</h3>
      <ol className="tally-list">
        {tallies.map((tally) => {
          const share = percent(tally.bottles, total);
          return (
            <li key={`${tally.name}|${tally.country ?? ''}`} title={`${tally.bottles} bottles · ${Math.round(share)}% of all consumed`}>
              <span className="tally-name">
                {flags && <Flag country={tally.country} />}
                {tally.name}
              </span>
              <span className="tally-count">{tally.bottles}</span>
              <span className="tally-bar" aria-hidden="true">
                <span style={{ width: `${share}%` }} />
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The styles, regions and grapes drunk most, by bottles consumed. */
export function FavouritesCard() {
  const { page, phase, error } = useSynced<ConsumedData>('/api/consumed', '/api/consumed/sync');

  let body;
  if (phase === 'loading') {
    body = <p className="card-message">Loading…</p>;
  } else if (error || !page) {
    body = <p className="card-message">{error ?? 'Could not load what has been consumed.'}</p>;
  } else if (page.wines.length === 0) {
    body = (
      <p className="card-message">
        Nothing consumed yet. <Link to="/consumed">Sync it</Link> to see it here.
      </p>
    );
  } else {
    const fav = favourites(page.wines);
    body = (
      <>
        <TallyList label="Styles" tallies={fav.styles} total={fav.bottles} />
        <TallyList label="Regions" tallies={fav.regions} total={fav.bottles} flags />
        <TallyList label="Grapes" tallies={fav.grapes} total={fav.bottles} />
        <p className="stat-note">By bottles drunk, out of {fav.bottles.toLocaleString('en-GB')}.</p>
      </>
    );
  }

  return <Card title="Favourites">{body}</Card>;
}
