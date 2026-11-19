/**
 * The consumed table's columns: the shared wine columns (wineColumns.ts),
 * then its own. The generic machinery is in table.ts.
 */
import { sourceLabel, type ConsumedWine } from './consumed.ts';
import { asDate, type Column } from './table.ts';
import { wineColumns } from './wineColumns.ts';

export { asDate };

export const consumedColumns: Column<ConsumedWine>[] = [
  ...wineColumns<ConsumedWine>(),
  {
    key: 'bottles',
    label: 'Bottles',
    align: 'right',
    sortValue: (w) => w.bottles,
    render: (w) => String(w.bottles),
    title: (w) =>
      w.counts.CellarTracker > 0 && w.counts.Vivino > 0
        ? `CellarTracker ${w.counts.CellarTracker} · Vivino ${w.counts.Vivino}`
        : undefined,
  },
  {
    key: 'lastDate',
    label: 'Last drunk',
    align: 'right',
    // ISO dates sort correctly as text. Most Vivino check-ins are undated.
    sortValue: (w) => w.lastDate,
    render: (w) => asDate(w.lastDate),
    title: (w) =>
      w.firstDate && w.firstDate !== w.lastDate ? `First drunk ${asDate(w.firstDate)}` : undefined,
  },
  {
    key: 'source',
    label: 'Source',
    align: 'left',
    sortValue: sourceLabel,
    render: sourceLabel,
  },
];
