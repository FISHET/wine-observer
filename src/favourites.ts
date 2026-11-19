/**
 * What's drunk most, by bottles consumed rather than by score: the styles,
 * regions and grapes at the top of the consumed list.
 */
import type { ConsumedWine } from './consumed.ts';

export type Tally = {
  name: string;
  bottles: number;
  /** The region's country, for its flag. Only set on regions. */
  country?: string;
};

export type Favourites = {
  /** Every bottle consumed, the whole each tally is a share of. */
  bottles: number;
  styles: Tally[];
  regions: Tally[];
  grapes: Tally[];
};

/**
 * Folds the two apps' styles into one set. CellarTracker writes "White -
 * Sparkling" and "Rosé - Sparkling" where Vivino just says "Sparkling", which
 * would otherwise split the sparkling wines three ways.
 */
export function broadStyle(style: string): string | null {
  const trimmed = style.trim();
  if (trimmed === '') return null;
  return /sparkling/i.test(trimmed) ? 'Sparkling' : trimmed;
}

/** The top `n` by bottles, ties broken by name so the order is stable. */
function top(
  lines: readonly ConsumedWine[],
  keyOf: (line: ConsumedWine) => { name: string; country?: string } | null,
  n: number,
): Tally[] {
  const tallies = new Map<string, Tally>();
  for (const line of lines) {
    const key = keyOf(line);
    if (!key) continue;
    const id = `${key.name}|${key.country ?? ''}`;
    const tally = tallies.get(id) ?? { ...key, bottles: 0 };
    tally.bottles += line.bottles;
    tallies.set(id, tally);
  }
  return [...tallies.values()]
    .sort((a, b) => b.bottles - a.bottles || a.name.localeCompare(b.name))
    .slice(0, n);
}

export function favourites(lines: readonly ConsumedWine[], n = 3): Favourites {
  return {
    bottles: lines.reduce((sum, line) => sum + line.bottles, 0),
    styles: top(lines, (l) => {
      const style = broadStyle(l.style);
      return style ? { name: style } : null;
    }, n),
    // As grouped by data/regions.json, so a Châteauneuf counts towards the
    // Southern Rhône. Keyed with the country too: there's more than one Georgia.
    regions: top(lines, (l) => (l.regionGroup ? { name: l.regionGroup, country: l.country } : null), n),
    grapes: top(lines, (l) => (l.grape ? { name: l.grape } : null), n),
  };
}
