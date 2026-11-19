/**
 * The columns every wine table starts with, in the same order: Producer,
 * Wine, Vintage, Style, Country, Region, Grape. Each table adds its own after.
 *
 * Producer leads because many wines, sparkling especially, are named only
 * "Brut" or "Blanc de Blancs" and read as nothing without it.
 */
import type { WineDescription } from './consumed.ts';
import { asYear, EMPTY, type Column } from './table.ts';

export function wineColumns<T extends WineDescription>(): Column<T>[] {
  return [
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
  ];
}
