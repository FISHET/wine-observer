import { PageCard } from './PageCard.tsx';
import { Link } from './router.tsx';
import { useTitle } from './SyncedLayout.tsx';

const PAGES = [
  { to: '/cellar', title: 'Cellar', blurb: 'Every wine in stock, with drinking windows and scores.' },
  { to: '/consumed', title: 'Consumed', blurb: 'Every wine drunk or tasted, from CellarTracker and Vivino.' },
  { to: '/scores', title: 'Scores', blurb: 'Every tasting, with its score and note, from both apps.' },
];

export function HomePage() {
  useTitle(null);

  return (
    <main>
      <header>
        <h1 className="wordmark">WineObserver</h1>
      </header>

      <hr />

      <nav className="page-cards" aria-label="Pages">
        {PAGES.map((page) => (
          <PageCard key={page.to} {...page} />
        ))}
      </nav>
    </main>
  );
}

export function NotFoundPage() {
  useTitle('Not found');

  return (
    <main>
      <nav>
        <Link to="/" className="back">
          ← Home
        </Link>
      </nav>
      <header>
        <h1>Not found</h1>
      </header>
      <p className="notice">There&rsquo;s no page here.</p>
    </main>
  );
}
