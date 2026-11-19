/**
 * The consumed table's columns. The generic machinery is in table.ts.
 *
 * The first seven follow the cellar table's order (Producer, Wine, Vintage,
 * Style, Country, Region, Grape), so every wine table reads the same way.
 * Producer leads because many wines, sparkling especially, are named only
 * "Brut" or "Blanc de Blancs" and read as nothing without it.
 */
import { sourceLabel, type ConsumedWine } from './consumed.ts';
import { asYear, EMPTY, type Column } from './table.ts';

const dayMonthYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "15 Nov 2026" from "2026-11-15". */
export const asDate = (iso: string | null) =>
  iso === null ? EMPTY : dayMonthYear.format(new Date(`${iso}T00:00:00Z`));

export const consumedColumns: Column<ConsumedWine>[] = [
  {
    key: 'producer',
    label: 'Producer',
    align: 'left',
    // Inverted form, so Château Batailley files under B, as on the cellar page.
    sortValue: (w) => w.sortProducer || null,
    render: (w) => w.producer || EMPTY,
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
    sortValue: (w) => w.vintage,
    render: (w) => (w.isNonVintage ? 'NV' : asYear(w.vintage)),
  },
  {
    key: 'style',
    label: 'Style',
    align: 'left',
    sortValue: (w) => w.style || null,
    render: (w) => w.style || EMPTY,
  },
  {
    key: 'country',
    label: 'Country',
    align: 'left',
    sortValue: (w) => w.country || null,
    render: (w) => w.country || EMPTY,
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
    // Vivino has no grape field, so its regional style stands in, mapped
    // to a grape by data/grape-styles.json where possible.
    title: (w) => {
      if (w.vivinoStyle === null) return undefined;
      return w.grape === w.vivinoStyle
        ? "Vivino's regional wine style, not mapped to a grape yet"
        : `Mapped from Vivino's "${w.vivinoStyle}"`;
    },
  },
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
