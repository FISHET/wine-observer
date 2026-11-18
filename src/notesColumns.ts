/**
 * The notes table's columns. The generic machinery is in table.ts.
 */
import type { Entry } from './notes.ts';
import { asMoney, asScore, asYear, EMPTY, scoreValue, type Column } from './table.ts';

const dayMonthYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "15 Nov 2026" from "2026-11-15". */
export const asDate = (iso: string | null) =>
  iso === null ? EMPTY : dayMonthYear.format(new Date(`${iso}T00:00:00Z`));

export const notesColumns: Column<Entry>[] = [
  {
    key: 'date',
    label: 'Date',
    align: 'right',
    // ISO dates sort correctly as text.
    sortValue: (e) => e.date,
    render: (e) => asDate(e.date),
  },
  {
    key: 'wine',
    label: 'Wine',
    align: 'left',
    wrap: true,
    // Inverted form, so Château Batailley files under B.
    sortValue: (e) => e.sortWine,
    render: (e) => e.wine,
  },
  {
    key: 'vintage',
    label: 'Vintage',
    align: 'right',
    sortValue: (e) => e.vintage,
    render: (e) => (e.isNonVintage ? 'NV' : asYear(e.vintage)),
  },
  {
    key: 'style',
    label: 'Style',
    align: 'left',
    sortValue: (e) => e.style,
    render: (e) => e.style,
  },
  {
    key: 'country',
    label: 'Country',
    align: 'left',
    sortValue: (e) => e.country,
    render: (e) => e.country,
  },
  {
    key: 'region',
    label: 'Region',
    align: 'left',
    sortValue: (e) => e.region,
    render: (e) => e.region ?? EMPTY,
    title: (e) => [e.subRegion, e.appellation].filter(Boolean).join(' · ') || undefined,
  },
  {
    key: 'grape',
    label: 'Grape',
    align: 'left',
    sortValue: (e) => e.grape,
    render: (e) => e.grape ?? EMPTY,
  },
  {
    key: 'how',
    label: 'How',
    align: 'left',
    // A note with no bottle wasn't from the cellar: a tasting, a bottle out.
    sortValue: (e) => (e.bottle ? e.bottle.reason || null : 'Not from the cellar'),
    render: (e) => (e.bottle ? e.bottle.reason || EMPTY : 'Not from the cellar'),
    title: (e) => e.bottle?.location ?? undefined,
  },
  {
    key: 'occasion',
    label: 'Occasion',
    align: 'left',
    sortValue: (e) => e.bottle?.occasion ?? null,
    render: (e) => e.bottle?.occasion ?? EMPTY,
  },
  {
    key: 'paid',
    label: 'Paid',
    align: 'right',
    sortValue: (e) => e.bottle?.paid ?? null,
    render: (e) => asMoney(e.bottle?.paid ?? null),
  },
  {
    key: 'score',
    label: 'My score',
    align: 'right',
    sortValue: (e) => scoreValue(e.note?.score ?? null),
    render: (e) => asScore(e.note?.score ?? null),
  },
  {
    key: 'liked',
    label: 'Liked',
    align: 'left',
    sortValue: (e) => (e.note?.liked ? 1 : null),
    render: (e) => (e.note?.liked ? '✓' : ''),
  },
  {
    key: 'note',
    label: 'Note',
    align: 'left',
    wrap: true,
    sortValue: (e) => e.note?.text ?? null,
    render: (e) => e.note?.text ?? EMPTY,
    // Only worth saying when the note was written on a different day.
    title: (e) => (e.note?.date && e.note.date !== e.date ? `Written ${asDate(e.note.date)}` : undefined),
  },
];
