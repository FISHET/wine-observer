/**
 * The columns every wine table starts with, in the same order: Producer,
 * Wine, Vintage, Style, Country, Region, Appellation, Grape. Each table adds
 * its own after.
 *
 * Producer leads because many wines, sparkling especially, are named only
 * "Brut" or "Blanc de Blancs" and read as nothing without it.
 */
import type { WineDescription } from './consumed.ts';
import { asYear, EMPTY, type Column } from './table.ts';

/** Where a wine is from, as recorded and as grouped by data/regions.json. */
type Place = {
  region: string | null;
  subRegion: string | null;
  appellation: string | null;
  regionGroup: string | null;
  regionMapped: boolean;
};

/**
 * The most specific name recorded: CellarTracker's appellation, else its
 * sub-region, else its region. Vivino records one name, usually the
 * appellation, so the same wine reads the same from either app.
 */
export function appellationOf(w: Place): string | null {
  return w.appellation ?? w.subRegion ?? w.region;
}

/**
 * Region and Appellation, the same on every table. Region is the grouping
 * from data/regions.json ("Southern Rhône"); Appellation is the most specific
 * name recorded ("Châteauneuf-du-Pape").
 */
export function placeColumns<T extends Place>(): Column<T>[] {
  return [
    {
      key: 'region',
      label: 'Region',
      align: 'left',
      sortValue: (w) => w.regionGroup,
      render: (w) => w.regionGroup ?? EMPTY,
      title: (w) => {
        const recorded = [w.region, w.subRegion, w.appellation].filter(Boolean).join(' › ');
        if (!recorded) return undefined;
        return w.regionMapped ? `Recorded as ${recorded}` : `Recorded as ${recorded}; not in data/regions.json yet`;
      },
    },
    {
      key: 'appellation',
      label: 'Appellation',
      align: 'left',
      sortValue: appellationOf,
      render: (w) => appellationOf(w) ?? EMPTY,
    },
  ];
}

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
    ...placeColumns<T>(),
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
