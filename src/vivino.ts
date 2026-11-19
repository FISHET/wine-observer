/**
 * Vivino's "full wine list" export: one row per check-in.
 *
 * Vivino has no API, so this is a one-off load. Save the export as
 * data/vivino.csv (git-ignored, and mounted into the container) and it is
 * read alongside the CellarTracker data. Repeat check-ins of a wine appear as
 * repeated rows, so a row is a bottle tasted.
 */
import { parseCsv, type Row } from './csv.ts';
import { parseDate } from './notes.ts';
import { text, type Score } from './wine.ts';

export const VIVINO_FILE = 'vivino.csv';

export type VivinoCheckIn = {
  producer: string;
  /** The wine's name without the producer: "Pauillac (Grand Cru Classé)". */
  name: string;
  /** Producer and name together, as CellarTracker would write it. */
  wine: string;
  /**
   * Null when Vivino has no vintage. That's ambiguous: a non-vintage wine,
   * or a vintage nobody recorded. 90 reds in the first export had none.
   */
  vintage: number | null;
  /** CellarTracker's wording: Red, White, Rosé, Sparkling… */
  style: string;
  country: string;
  region: string | null;
  /**
   * Vivino's "Regional wine style", such as "Napa Valley Bordeaux Blend" or
   * "Southern Rhône Red". Vivino has no grape field; this is the nearest to
   * CellarTracker's, so it stands in for the grape until wines are mapped.
   */
  wineStyle: string | null;
  /** ISO date. Vivino only records it for some check-ins. */
  date: string | null;
  /** Your rating as Vivino gives it, out of 5. */
  stars: number | null;
  /** The rating on the 100-point scale; see starsToPoints. */
  score: Score | null;
  review: string | null;
  link: string | null;
};

/**
 * Vivino rates out of 5; CellarTracker and the critics out of 100. The
 * 100-point scale really starts at 50, so stars map onto 50–100: 4.0 is 90
 * ("outstanding"), 3.0 is 80, 2.0 is 70. On wines rated in both apps this
 * landed within a point or so of the CellarTracker score, where doubling
 * (stars × 20) read about six points low.
 */
export function starsToPoints(stars: number): number {
  return Math.round(50 + 10 * stars);
}

const STYLES: Record<string, string> = {
  'Red Wine': 'Red',
  'White Wine': 'White',
  'Rosé Wine': 'Rosé',
  Sparkling: 'Sparkling',
  'Dessert Wine': 'Dessert',
  'Fortified Wine': 'Fortified',
};

/** Vivino's country names where CellarTracker's differ. */
const COUNTRIES: Record<string, string> = {
  'United States': 'USA',
};

/** "Château Batailley" + "Pauillac" -> "Château Batailley Pauillac", without doubling up. */
function fullName(producer: string, name: string): string {
  if (!producer) return name;
  if (!name) return producer;
  return name.toLowerCase().startsWith(producer.toLowerCase()) ? name : `${producer} ${name}`;
}

export function toCheckIn(row: Row): VivinoCheckIn {
  const producer = (row['Winery'] ?? '').trim();
  const name = (row['Wine name'] ?? '').trim();
  const vintage = Number((row['Vintage'] ?? '').trim());
  const stars = Number((row['Your rating'] ?? '').trim());
  const hasStars = (row['Your rating'] ?? '').trim() !== '' && Number.isFinite(stars) && stars > 0;
  const style = (row['Wine type'] ?? '').trim();
  const country = (row['Country'] ?? '').trim();

  return {
    producer,
    name,
    wine: fullName(producer, name),
    vintage: Number.isInteger(vintage) && vintage > 1000 ? vintage : null,
    style: STYLES[style] ?? style,
    country: COUNTRIES[country] ?? country,
    region: text(row, 'Region'),
    wineStyle: text(row, 'Regional wine style'),
    date: parseDate(row['Scan date']),
    stars: hasStars ? stars : null,
    score: hasStars ? { value: starsToPoints(stars), text: String(starsToPoints(stars)) } : null,
    review: text(row, 'Your review'),
    link: text(row, 'Link to wine'),
  };
}

export type VivinoExport = {
  checkIns: VivinoCheckIn[];
  /**
   * Rows with no winery and no wine name, so no way to say what was drunk.
   * In the first export these were label scans Vivino never identified: just
   * a scan date and a photo of the label.
   */
  unidentified: number;
  /** Rows dropped as wishlist entries rather than wines drunk; see dropWishlisted. */
  wishlisted: number;
};

const identified = (row: Row) => Boolean((row['Winery'] ?? '').trim() || (row['Wine name'] ?? '').trim());

/**
 * Vivino's wishlist export, saved as data/wishlisted.csv. Its rows have the
 * same columns as the full wine list, plus a "Wishlisted date".
 */
export const WISHLIST_FILE = 'wishlisted.csv';

/** Vivino's wine page is per vintage; the names are the fallback when it's missing. */
function wineKeys(row: Row): string[] {
  const link = (row['Link to wine'] ?? '').trim();
  const names = ['Winery', 'Wine name', 'Vintage'].map((c) => (row[c] ?? '').trim().toLowerCase()).join('|');
  return link ? [`link:${link}`, `name:${names}`] : [`name:${names}`];
}

const isRatedOrReviewed = (row: Row) => {
  const stars = Number((row['Your rating'] ?? '').trim());
  return (Number.isFinite(stars) && stars > 0) || (row['Your review'] ?? '').trim() !== '';
};

/**
 * Vivino's "full wine list" includes wishlisted wines alongside the ones
 * drunk, and there's no export of just the ones drunk. So a row is dropped
 * when it's on the wishlist and has no rating and no review. A rated row is
 * almost certainly a real tasting, so it stays. Each wishlist entry drops at
 * most one row, so a real unrated check-in of the same wine survives.
 */
export function dropWishlisted(rows: readonly Row[], wishlist: readonly Row[]): { kept: Row[]; dropped: number } {
  const pending = new Map<string, number>(); // key -> wishlist entry index
  wishlist.forEach((entry, i) => {
    for (const key of wineKeys(entry)) if (!pending.has(key)) pending.set(key, i);
  });
  const used = new Set<number>();

  const kept = rows.filter((row) => {
    if (isRatedOrReviewed(row)) return true;
    const entry = wineKeys(row)
      .map((key) => pending.get(key))
      .find((i) => i !== undefined && !used.has(i));
    if (entry === undefined) return true;
    used.add(entry);
    return false;
  });

  return { kept, dropped: rows.length - kept.length };
}

/** `wishlistCsv` is Vivino's wishlist export, or null when there isn't one. */
export function parseVivino(csv: string, wishlistCsv: string | null = null): VivinoExport {
  const rows = parseCsv(csv);
  const { kept, dropped } = dropWishlisted(rows, wishlistCsv ? parseCsv(wishlistCsv) : []);
  const named = kept.filter(identified);
  return { checkIns: named.map(toCheckIn), unidentified: kept.length - named.length, wishlisted: dropped };
}
