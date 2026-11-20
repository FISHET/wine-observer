/**
 * Every tasting, one line each. The same wine is tasted several times as it
 * matures, and each time gets its own note and score, so tastings are not
 * grouped by wine here as they are on the consumed page.
 *
 * A tasting is a CellarTracker note, or a Vivino check-in with a rating or a
 * review. A Vivino check-in with neither says only that the wine was drunk,
 * which the consumed page already counts.
 *
 * A tasting logged in both apps stays as two lines. Vivino rarely dates a
 * check-in, so there's no telling which CellarTracker note it goes with when
 * a wine was tasted more than once. The wine description is shared, though:
 * a Vivino tasting of a wine CellarTracker knows is described as
 * CellarTracker describes it (see mergeWines).
 */
import type { MergedWine, Source, WineDescription } from './consumed.ts';
import type { Score } from './wine.ts';

export type Tasting = WineDescription & {
  /** Unique across sources: "ct-note-456", "vivino-12-0". */
  key: string;
  /** The consumed line this tasting belongs to. */
  wineKey: string;
  source: Source;
  /** ISO date. Most Vivino check-ins have none. */
  date: string | null;
  /** On the 100-point scale; Vivino's stars are converted (see starsToPoints). */
  score: Score | null;
  /** Vivino's own rating, out of 5. */
  stars: number | null;
  note: string | null;
  /** CellarTracker's "I like this wine" tick. Null when not answered or from Vivino. */
  liked: boolean | null;
};

function describe(line: WineDescription): WineDescription {
  const { name, wine, sortWine, producer, sortProducer, vintage, isNonVintage, style, country, region, subRegion, appellation, grape, vivinoStyle, regionGroup, regionMapped } = line;
  return { name, wine, sortWine, producer, sortProducer, vintage, isNonVintage, style, country, region, subRegion, appellation, grape, vivinoStyle, regionGroup, regionMapped };
}

export function buildTastings(wines: readonly MergedWine[]): Tasting[] {
  return wines.flatMap(({ line, entries, checkIns }, wineIndex) => {
    const wine = describe(line);

    const fromNotes = entries.flatMap((entry): Tasting[] =>
      entry.note
        ? [
            {
              ...wine,
              key: `ct-note-${entry.note.id}`,
              wineKey: line.key,
              source: 'CellarTracker',
              date: entry.note.date,
              score: entry.note.score,
              stars: null,
              note: entry.note.text,
              liked: entry.note.liked,
            },
          ]
        : [],
    );

    const fromVivino = checkIns.flatMap((checkIn, i): Tasting[] =>
      checkIn.score || checkIn.review
        ? [
            {
              ...wine,
              // Vivino check-ins have no id of their own.
              key: `vivino-${wineIndex}-${i}`,
              wineKey: line.key,
              source: 'Vivino',
              date: checkIn.date,
              score: checkIn.score,
              stars: checkIn.stars,
              note: checkIn.review,
              liked: null,
            },
          ]
        : [],
    );

    return [...fromNotes, ...fromVivino];
  });
}

export type ScoresTotals = {
  tastings: number;
  /** Distinct wines (and vintages) tasted. */
  wines: number;
  scored: number;
  /** Mean of the scored tastings, or null when none are scored. */
  averageScore: number | null;
  /** Wines with more than one tasting: the ones that show how a wine is maturing. */
  tastedMoreThanOnce: number;
};

export function scoresTotals(tastings: readonly Tasting[]): ScoresTotals {
  const scores = tastings.flatMap((t) => (t.score ? [t.score.value] : []));
  const perWine = new Map<string, number>();
  for (const t of tastings) perWine.set(t.wineKey, (perWine.get(t.wineKey) ?? 0) + 1);

  return {
    tastings: tastings.length,
    wines: perWine.size,
    scored: scores.length,
    averageScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    tastedMoreThanOnce: [...perWine.values()].filter((n) => n > 1).length,
  };
}
