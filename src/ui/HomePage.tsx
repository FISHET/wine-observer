import { Link } from './router.tsx';
import { useTitle } from './SyncedLayout.tsx';

const PAGES = [
  { to: '/cellar', title: 'Cellar', blurb: 'Every wine in stock, with drinking windows and scores.' },
  { to: '/consumed', title: 'Consumed', blurb: 'Every wine drunk or tasted, from CellarTracker and Vivino.' },
];

export function HomePage() {
  useTitle(null);

  return (
    <main>
      <header>
        <h1>Cellar</h1>
      </header>

      <ul className="pages">
        {PAGES.map((page) => (
          <li key={page.to}>
            <Link to={page.to}>
              <strong>{page.title}</strong>
              <span>{page.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
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
