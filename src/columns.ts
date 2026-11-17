/**
 * The table's columns: what to show, what to sort on, and how to render it.
 * Pure, so the ordering can be tested without rendering anything.
 */
import type { Score, Wine } from './wine.ts';

export type SortValue = string | number | null;

export type Column = {
  key: string;
  label: string;
  align: 'left' | 'right';
  /** Null sorts last whichever way the column is pointing. */
  sortValue: (wine: Wine) => SortValue;
  render: (wine: Wine) => string;
  title?: (wine: Wine) => string | undefined;
};

const gbp = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

export const EMPTY = '–'; // en dash

const asMoney = (value: number | null) => (value === null ? EMPTY : gbp.format(value));
const asCount = (value: number) => (value === 0 ? EMPTY : String(value));
const asYear = (value: number | null) => (value === null ? EMPTY : String(value));
const asScore = (score: Score | null) => (score === null ? EMPTY : score.text);
const scoreValue = (score: Score | null) => (score === null ? null : score.value);

export const columns: Column[] = [
  {
    key: 'wine',
    label: 'Wine',
    align: 'left',
    sortValue: (w) => w.wine,
    render: (w) => w.wine,
  },
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

export type Direction = 'asc' | 'desc';

const collator = new Intl.Collator('en-GB', { sensitivity: 'base', numeric: true });

/**
 * Sorts a copy of the wines by one column. Blanks always sort last, so that
 * flipping the direction doesn't bury the rows that do have a value.
 */
export function sortWines(wines: Wine[], column: Column, direction: Direction): Wine[] {
  const sign = direction === 'asc' ? 1 : -1;

  return [...wines].sort((a, b) => {
    const left = column.sortValue(a);
    const right = column.sortValue(b);

    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;

    if (typeof left === 'number' && typeof right === 'number') {
      return (left - right) * sign;
    }

    return collator.compare(String(left), String(right)) * sign;
  });
}
