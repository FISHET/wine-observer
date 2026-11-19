/**
 * The cellar table's columns: what to show, what to sort on, and how to
 * render it. The generic machinery lives in table.ts.
 */
import {
  asCount,
  asMoney,
  asScore,
  asYear,
  EMPTY,
  scoreValue,
  sortRows,
  type Column,
  type Direction,
} from './table.ts';
import type { Wine } from './wine.ts';

export { EMPTY };

export const columns: Column<Wine>[] = [
  {
    key: 'producer',
    label: 'Producer',
    align: 'left',
    // Sorts on CellarTracker's inverted form, so Château Batailley files
    // under B rather than under C with every other château.
    sortValue: (w) => w.sortProducer,
    render: (w) => w.producer,
  },
  {
    key: 'wine',
    label: 'Wine',
    align: 'left',
    wrap: true,
    // The producer has its own column, so it isn't repeated here.
    sortValue: (w) => w.name,
    render: (w) => w.name,
    title: (w) => (w.wine !== w.name ? w.wine : undefined),
  },
  {
    key: 'vintage',
    label: 'Vintage',
    align: 'right',
    // NV has no year, so it sorts with the blanks rather than as year 1001.
    sortValue: (w) => w.vintage,
    render: (w) => (w.isNonVintage ? 'NV' : asYear(w.vintage)),
  },
  {
    key: 'style',
    label: 'Style',
    align: 'left',
    sortValue: (w) => w.style,
    render: (w) => w.style,
  },
  {
    key: 'country',
    label: 'Country',
    align: 'left',
    sortValue: (w) => w.country,
    render: (w) => w.country,
  },
  {
    key: 'region',
    label: 'Region',
    align: 'left',
    sortValue: (w) => w.region,
    render: (w) => w.region ?? EMPTY,
    title: (w) => [w.subRegion, w.appellation].filter(Boolean).join(' · ') || undefined,
  },
  {
    key: 'grape',
    label: 'Grape',
    align: 'left',
    sortValue: (w) => w.grape,
    render: (w) => w.grape ?? EMPTY,
  },
  {
    key: 'size',
    label: 'Size',
    align: 'left',
    sortValue: (w) => w.size,
    render: (w) => w.size,
  },
  {
    key: 'inStock',
    label: 'In stock',
    align: 'right',
    sortValue: (w) => w.inStock,
    render: (w) => asCount(w.inStock),
  },
  {
    key: 'pending',
    label: 'Pending',
    align: 'right',
    sortValue: (w) => w.pending,
    render: (w) => asCount(w.pending),
  },
  {
    key: 'paid',
    label: 'Paid',
    align: 'right',
    sortValue: (w) => w.paid,
    render: (w) => asMoney(w.paid),
  },
  {
    key: 'value',
    label: 'Value',
    align: 'right',
    sortValue: (w) => w.value,
    render: (w) => asMoney(w.value),
  },
  {
    key: 'drinkFrom',
    label: 'Drink from',
    align: 'right',
    sortValue: (w) => w.drinkFrom,
    render: (w) => asYear(w.drinkFrom),
  },
  {
    key: 'drinkTo',
    label: 'Drink to',
    align: 'right',
    sortValue: (w) => w.drinkTo,
    render: (w) => asYear(w.drinkTo),
  },
  {
    key: 'myScore',
    label: 'My score',
    align: 'right',
    sortValue: (w) => scoreValue(w.myScore),
    render: (w) => asScore(w.myScore),
  },
  {
    key: 'communityScore',
    label: 'CT score',
    align: 'right',
    sortValue: (w) => scoreValue(w.communityScore),
    // The community average carries false precision: 91.8429752066116.
    render: (w) => (w.communityScore === null ? EMPTY : w.communityScore.value.toFixed(1)),
  },
  {
    key: 'decanterScore',
    label: 'Decanter',
    align: 'right',
    sortValue: (w) => scoreValue(w.decanterScore),
    render: (w) => asScore(w.decanterScore),
  },
];

export function sortWines(wines: Wine[], column: Column<Wine>, direction: Direction): Wine[] {
  return sortRows(wines, column, direction);
}
