import { useMemo } from 'react';

import csv from '../../data/cellar.csv?raw';
import { parseCellar, totals } from '../wine.ts';
import { WineTable } from './WineTable.tsx';

export function App() {
  const wines = useMemo(() => parseCellar(csv), []);
  const counts = totals(wines);

  return (
    <main>
      <header>
        <h1>Cellar</h1>
        <p className="summary">
          {counts.wines} wines · {counts.bottles} bottles in stock · {counts.pending} pending
        </p>
      </header>
      <WineTable wines={wines} />
    </main>
  );
}
