/**
 * The cellar as the app sees it: one Wine per CellarTracker row, which means
 * one row per wine, vintage and bottle size, carrying a count of bottles.
 */
import { parseCsv, type Row } from './csv.ts';

/** CellarTracker's stand-in vintage for a non-vintage wine. */
export const NON_VINTAGE = 1001;

/** CellarTracker writes this word rather than leaving a field empty. */
const UNKNOWN = 'Unknown';

/**
 * A score as given. Critic scores are not always plain numbers: barrel samples
 * come through as ranges like 85-87, and some critics write 94+. Keep the
 * original text so the table can show what was actually published.
 */
export type Score = {
  /** A number to sort and compare on. A range uses its midpoint. */
  value: number;
  /** Exactly as CellarTracker gave it. */
  text: string;
};

export type Wine = {
  /** iWine: stable across vintages of the same wine. */
  id: string;
  /** Producer and name together, as CellarTracker writes it. */
  wine: string;
  /** The wine's own name, without the producer: see wineName. */
  name: string;
  producer: string;
  /** Producer with the name inverted, for sorting: "Batailley, Château". */
  sortProducer: string;
  /** Null for a non-vintage wine. */
  vintage: number | null;
  isNonVintage: boolean;
  /** CellarTracker's Type: Red, White - Sparkling, and so on. */
  style: string;
  colour: string;
  category: string;
  country: string;
  region: string | null;
  subRegion: string | null;
  appellation: string | null;
  /** MasterVarietal: the tidier of the two grape fields. */
  grape: string | null;
  /**
   * The region to count the wine under, from data/regions.json (see
   * regions.ts). The region as recorded until the API applies the table.
   */
  regionGroup: string | null;
  /** Whether data/regions.json gave regionGroup. */
  regionMapped: boolean;
  size: string;
  /** Bottles held, including any in bond. */
  inStock: number;
  /** Ordered but not yet arrived, mostly en primeur. */
  pending: number;
  /** What was paid, per bottle. Missing on about half the cellar. */
  paid: number | null;
  /** CellarTracker's Valuation: MyValue, then WBValue, then CTValue. */
  value: number | null;
  /** Always null for NV: a non-vintage bottle has no meaningful window. */
  drinkFrom: number | null;
  drinkTo: number | null;
  myScore: Score | null;
  communityScore: Score | null;
  decanterScore: Score | null;
};

export function text(row: Row, column: string): string | null {
  const value = (row[column] ?? '').trim();
  return value === '' || value === UNKNOWN ? null : value;
}

export function number(row: Row, column: string): number | null {
  const value = (row[column] ?? '').trim();
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A count, where CellarTracker's empty or zero both mean none. */
function count(row: Row, column: string): number {
  return number(row, column) ?? 0;
}

/** Money, where zero means "not recorded" rather than "free". */
export function money(row: Row, column: string): number | null {
  const value = number(row, column);
  return value === null || value === 0 ? null : value;
}

/**
 * The wine's own name, without the producer CellarTracker puts in front:
 * "Château Larrivet-Haut-Brion Domaine de Larrivet-Haut-Brion" from
 * Château Larrivet-Haut-Brion is "Domaine de Larrivet-Haut-Brion".
 *
 * When the wine is named after the producer and nothing is left (Château
 * Batailley), the fallback is used, typically the appellation: "Pauillac".
 */
export function wineName(full: string, producer: string, fallback?: string | null): string {
  const startsWithProducer = producer !== '' && full.toLowerCase().startsWith(producer.toLowerCase());
  const rest = startsWithProducer ? full.slice(producer.length).replace(/^[\s,–-]+/, '').trim() : full;
  return rest || fallback || full;
}

export function parseScore(raw: string | null | undefined): Score | null {
  const value = (raw ?? '').trim();
  if (value === '') return null;

  // A range such as 85-87 scores as its midpoint.
  const range = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/.exec(value);
  if (range) {
    return { value: (Number(range[1]) + Number(range[2])) / 2, text: value };
  }

  // A number, possibly with a trailing + or ?.
  const single = /^(\d+(?:\.\d+)?)/.exec(value);
  if (single) return { value: Number(single[1]), text: value };

  return null;
}

export function toWine(row: Row): Wine {
  const rawVintage = number(row, 'Vintage');
  const isNonVintage = rawVintage === NON_VINTAGE;

  return {
    id: (row['iWine'] ?? '').trim(),
    wine: (row['Wine'] ?? '').trim(),
    name: wineName(
      (row['Wine'] ?? '').trim(),
      (row['Producer'] ?? '').trim(),
      text(row, 'Appellation') ?? text(row, 'Region'),
    ),
    producer: (row['Producer'] ?? '').trim(),
    sortProducer: (row['SortProducer'] ?? row['Producer'] ?? '').trim(),
    vintage: isNonVintage ? null : rawVintage,
    isNonVintage,
    style: (row['Type'] ?? '').trim(),
    colour: (row['Color'] ?? '').trim(),
    category: (row['Category'] ?? '').trim(),
    country: (row['Country'] ?? '').trim(),
    region: text(row, 'Region'),
    subRegion: text(row, 'SubRegion'),
    appellation: text(row, 'Appellation'),
    grape: text(row, 'MasterVarietal') ?? text(row, 'Varietal'),
    regionGroup: text(row, 'Region'),
    regionMapped: false,
    size: (row['Size'] ?? '').trim(),
    inStock: count(row, 'Quantity'),
    pending: count(row, 'Pending'),
    paid: money(row, 'Price'),
    value: money(row, 'Valuation'),
    // The NV rule: CellarTracker still fills in a window for non-vintage
    // wines, but it can't know when the bottle was made or disgorged, so it
    // means nothing. Dropping it here stops every later view treating an NV
    // bottle as past its window.
    drinkFrom: isNonVintage ? null : number(row, 'BeginConsume'),
    drinkTo: isNonVintage ? null : number(row, 'EndConsume'),
    myScore: parseScore(row['MY']),
    communityScore: parseScore(row['CT']),
    decanterScore: parseScore(row['DR']),
  };
}

export function parseCellar(csv: string): Wine[] {
  return parseCsv(csv).map(toWine);
}

export type CellarTotals = {
  wines: number;
  bottles: number;
  pending: number;
  /**
   * What the bottles in stock are worth: each wine's valuation times its
   * bottles. Pending bottles aren't counted, as they aren't held yet.
   */
  value: number;
  /** Bottles in stock with no valuation, so left out of `value`. */
  unvaluedBottles: number;
};

export function totals(wines: Wine[]): CellarTotals {
  return {
    wines: wines.length,
    bottles: wines.reduce((sum, w) => sum + w.inStock, 0),
    pending: wines.reduce((sum, w) => sum + w.pending, 0),
    value: wines.reduce((sum, w) => sum + (w.value ?? 0) * w.inStock, 0),
    unvaluedBottles: wines.reduce((sum, w) => sum + (w.value === null ? w.inStock : 0), 0),
  };
}
