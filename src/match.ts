/**
 * Telling whether two apps' names refer to the same wine.
 *
 * CellarTracker gives one full name ("Château Batailley Pauillac"); Vivino
 * splits it into winery and wine ("Château Batailley", "Pauillac (Grand Cru
 * Classé)"). Neither has an id the other knows, so the names are compared as
 * bags of words: accents, case, punctuation and filler words are ignored.
 */

/** Words too common in wine names to tell two wines apart. */
const FILLER = new Set([
  'chateau', 'domaine', 'dom', 'bodegas', 'bodega', 'cantina', 'tenuta', 'weingut', 'maison', 'clos',
  'estate', 'estates', 'winery', 'wines', 'wine', 'vineyard', 'vineyards', 'cellars', 'family',
  'the', 'and', 'et', 'de', 'du', 'des', 'la', 'le', 'les', 'del', 'di', 'da', 'y', 'e', 'of',
  'grand', 'cru', 'classe', 'vin', 'red', 'rouge', 'tinto', 'rosso', 'blend', 'cuvee', 'brut', 'sparkling',
]);

export function words(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // accents: Télégraphe -> Telegraphe
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 1 && !FILLER.has(word));
}

/** Share of `part`'s words found in `whole`, from 0 to 1. */
export function coverage(part: readonly string[], whole: readonly string[]): number {
  if (part.length === 0) return 0;
  const bag = new Set(whole);
  return part.filter((word) => bag.has(word)).length / part.length;
}

export type NameParts = {
  producer: string;
  wine: string;
  /** Vivino often leaves the appellation out of the name but gives it here. */
  region?: string | null;
};

/**
 * How well a split name (Vivino's winery and wine) matches a full name
 * (CellarTracker's), from 0 to 1.
 *
 * Checked both ways round, so a generic name can't claim a specific cuvée:
 * every word of "Font du Loup Châteauneuf-du-Pape" appears in "Font du Loup
 * Châteauneuf-du-Pape Le Puy Rolland", but not the other way. The region
 * counts on the split side only, to fill in an appellation left out of the
 * name. Zero when the producer doesn't appear at all: two wines called
 * "Gran Reserva" from different bodegas are not one.
 */
export function nameMatch(split: NameParts, full: string): number {
  const fullWords = words(full);
  const producer = words(split.producer);
  const named = [...producer, ...words(split.wine)];

  if (producer.length > 0 && coverage(producer, fullWords) < 0.5) return 0;

  const forward = coverage(named, fullWords);
  const reverse = coverage(fullWords, [...named, ...words(split.region ?? '')]);
  return Math.min(forward, reverse);
}

/** The score a pair needs to count as the same wine. */
export const MATCH_THRESHOLD = 0.75;
