/**
 * The scores table's columns: the score, the shared wine columns
 * (wineColumns.ts), then the rest of the tasting. The generic machinery is in
 * table.ts.
 */
import type { Tasting } from './scores.ts';
import { asDate, asScore, EMPTY, scoreValue, type Column } from './table.ts';
import { wineColumns } from './wineColumns.ts';

/**
 * Score leads, ahead of the shared wine columns that start every other table:
 * it's what this page is for.
 */
export const scoresColumns: Column<Tasting>[] = [
  {
    key: 'score',
    label: 'Score',
    align: 'right',
    sortValue: (t) => scoreValue(t.score),
    render: (t) => asScore(t.score),
    title: (t) => (t.stars !== null ? `${t.stars} stars on Vivino` : undefined),
  },
  ...wineColumns<Tasting>(),
  {
    key: 'liked',
    label: 'Liked',
    align: 'left',
    sortValue: (t) => (t.liked ? 1 : null),
    render: (t) => (t.liked ? '✓' : ''),
  },
  {
    key: 'date',
    label: 'Tasted',
    align: 'right',
    // ISO dates sort correctly as text.
    sortValue: (t) => t.date,
    render: (t) => asDate(t.date),
    title: (t) => (t.date === null && t.source === 'Vivino' ? 'Vivino didn’t record a date' : undefined),
  },
  {
    key: 'note',
    label: 'Note',
    align: 'left',
    wrap: true,
    sortValue: (t) => t.note,
    render: (t) => t.note ?? EMPTY,
  },
  {
    key: 'source',
    label: 'Source',
    align: 'left',
    sortValue: (t) => t.source,
    render: (t) => t.source,
  },
];
