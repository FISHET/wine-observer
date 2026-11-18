/**
 * What every sortable table shares: a column definition and a sort that keeps
 * blanks at the bottom. Pure, so ordering can be tested without rendering.
 */
import type { Score } from './wine.ts';

export type SortValue = string | number | null;

export type Column<T> = {
  key: string;
  label: string;
  align: 'left' | 'right';
  /** Long text that should wrap rather than stretch the table. */
  wrap?: boolean;
  /** Null sorts last whichever way the column is pointing. */
  sortValue: (row: T) => SortValue;
  render: (row: T) => string;
  title?: (row: T) => string | undefined;
};

export type Direction = 'asc' | 'desc';

export const EMPTY = '–'; // en dash

const gbp = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

export const asMoney = (value: number | null) => (value === null ? EMPTY : gbp.format(value));
export const asCount = (value: number) => (value === 0 ? EMPTY : String(value));
export const asYear = (value: number | null) => (value === null ? EMPTY : String(value));
export const asScore = (score: Score | null) => (score === null ? EMPTY : score.text);
export const scoreValue = (score: Score | null) => (score === null ? null : score.value);

const collator = new Intl.Collator('en-GB', { sensitivity: 'base', numeric: true });

/**
 * Sorts a copy of the rows by one column. Blanks always sort last, so that
 * flipping the direction doesn't bury the rows that do have a value.
 */
export function sortRows<T>(rows: readonly T[], column: Column<T>, direction: Direction): T[] {
  const sign = direction === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
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
