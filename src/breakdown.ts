/**
 * The styles, regions and grapes that make up a set of bottles, most first:
 * what's been drunk, or what's in the cellar. Weighted by bottles, not wines
 * or scores.
 */

/** What a breakdown needs from a wine: a consumed line, or a cellar wine. */
export type Countable = {
  style: string;
  country: string;
  /** As grouped by data/regions.json; see regions.ts. */
  regionGroup: string | null;
  grape: string | null;
  bottles: number;
};

export type Tally = {
  name: string;
  bottles: number;
  /** The region's country, for its flag. Only set on regions. */
  country?: string;
};

export type Breakdown = {
  /** Every bottle counted, the whole each tally is a share of. */
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
  items: readonly Countable[],
  keyOf: (item: Countable) => { name: string; country?: string } | null,
  n: number,
): Tally[] {
  const tallies = new Map<string, Tally>();
  for (const item of items) {
    const key = keyOf(item);
    if (!key || item.bottles <= 0) continue;
    const id = `${key.name}|${key.country ?? ''}`;
    const tally = tallies.get(id) ?? { ...key, bottles: 0 };
    tally.bottles += item.bottles;
    tallies.set(id, tally);
  }
  return [...tallies.values()]
    .sort((a, b) => b.bottles - a.bottles || a.name.localeCompare(b.name))
    .slice(0, n);
}

export function breakdown(items: readonly Countable[], n = 3): Breakdown {
  return {
    bottles: items.reduce((sum, item) => sum + Math.max(item.bottles, 0), 0),
    styles: top(items, (i) => {
      const style = broadStyle(i.style);
      return style ? { name: style } : null;
    }, n),
    // Keyed with the country too: there's more than one Georgia.
    regions: top(items, (i) => (i.regionGroup ? { name: i.regionGroup, country: i.country } : null), n),
    grapes: top(items, (i) => (i.grape ? { name: i.grape } : null), n),
  };
}
