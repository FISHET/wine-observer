/**
 * Every tasting note, and every bottle that has left the cellar.
 *
 * Built from two CellarTracker tables: Consumed (one row per bottle drunk,
 * gifted, cooked with and so on) and Notes. A bottle and its note become one
 * entry. A note with no bottle, such as a tasting or a bottle out, is an
 * entry of its own, and so is a bottle nobody wrote up.
 *
 * Entries carry their source, so notes from elsewhere (Vivino, later) can be
 * mapped into the same shape and listed alongside.
 */
import { parseCsv, type Row } from './csv.ts';
import { money, NON_VINTAGE, number, parseScore, text, type Score } from './wine.ts';

export type Source = 'CellarTracker';

/** Which wine, as both CellarTracker tables describe it. */
export type WineInfo = {
  /** iWine: identifies the wine and vintage. */
  wineId: string;
  /** The full name, producer included; Consumed has no Producer column. */
  wine: string;
  /** Inverted for sorting: "Batailley, Château". */
  sortWine: string;
  vintage: number | null;
  isNonVintage: boolean;
  style: string;
  colour: string;
  country: string;
  region: string | null;
  subRegion: string | null;
  appellation: string | null;
  grape: string | null;
};

export type TastingNote = WineInfo & {
  /** iNote */
  id: string;
  /** ISO date, yyyy-mm-dd. */
  date: string | null;
  score: Score | null;
  text: string | null;
  /** CellarTracker's "I like this wine" tick. Null when not answered. */
  liked: boolean | null;
};

export type ConsumedBottle = WineInfo & {
  /** iConsumed: one per bottle. */
  id: string;
  size: string;
  /** ISO date, yyyy-mm-dd. */
  date: string | null;
  /** CellarTracker's ShortType: Drank, Restaurant, Tasted, Gifted, Cooking, Dropped… */
  reason: string;
  /** The free-text consumption note, often the occasion: "Jade's birthday". */
  occasion: string | null;
  /** Where it came out of: Cellar, Wine Fridge. */
  location: string | null;
  paid: number | null;
  /** The iNote CellarTracker linked, if any. */
  noteId: string | null;
};

/** The bottle details, present when the entry is a bottle from the cellar. */
export type Consumption = Pick<ConsumedBottle, 'id' | 'size' | 'reason' | 'occasion' | 'location' | 'paid'>;

/** One row on the notes page. */
export type Entry = WineInfo & {
  /** Unique across sources and kinds: "ct-bottle-123", "ct-note-456". */
  key: string;
  source: Source;
  /** When it was drunk, or for a note with no bottle, when it was written. */
  date: string | null;
  bottle: Consumption | null;
  note: TastingNote | null;
};

const pad = (n: number) => String(n).padStart(2, '0');

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects 31/02 and the like, which Date would quietly roll over.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * CellarTracker writes dates in the account's locale, which for this cellar
 * is day first: 15/11/2026. An ISO date is accepted too.
 */
export function parseDate(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dayFirst = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value);
  if (dayFirst) return isoDate(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));

  return null;
}

/** Whole days from one ISO date to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** An id column, where CellarTracker writes 0 or nothing for "none". */
function id(row: Row, column: string): string | null {
  const value = (row[column] ?? '').trim();
  return value === '' || value === '0' ? null : value;
}

function flag(row: Row, column: string): boolean | null {
  const value = (row[column] ?? '').trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

export function toWineInfo(row: Row): WineInfo {
  const rawVintage = number(row, 'Vintage');
  const isNonVintage = rawVintage === NON_VINTAGE;

  return {
    wineId: (row['iWine'] ?? '').trim(),
    wine: (row['Wine'] ?? '').trim(),
    sortWine: (row['SortWine'] ?? row['Wine'] ?? '').trim(),
    vintage: isNonVintage ? null : rawVintage,
    isNonVintage,
    style: (row['Type'] ?? '').trim(),
    colour: (row['Color'] ?? '').trim(),
    country: (row['Country'] ?? '').trim(),
    region: text(row, 'Region'),
    subRegion: text(row, 'SubRegion'),
    appellation: text(row, 'Appellation'),
    grape: text(row, 'MasterVarietal') ?? text(row, 'Varietal'),
  };
}

export function toNote(row: Row): TastingNote {
  const score = parseScore(row['Rating']);
  return {
    ...toWineInfo(row),
    id: (row['iNote'] ?? '').trim(),
    date: parseDate(row['TastingDate']),
    // An unscored note comes through as 0, not as a blank.
    score: score && score.value > 0 ? score : null,
    text: text(row, 'TastingNotes'),
    liked: flag(row, 'fLikeIt'),
  };
}

export function toConsumedBottle(row: Row): ConsumedBottle {
  const year = number(row, 'ConsumedYear');
  const month = number(row, 'ConsumedMonth');
  const day = number(row, 'ConsumedDay');

  return {
    ...toWineInfo(row),
    id: (row['iConsumed'] ?? '').trim(),
    size: (row['Size'] ?? '').trim(),
    // The split-out columns don't depend on the account's date format.
    date:
      year !== null && month !== null && day !== null
        ? isoDate(year, month, day)
        : parseDate(row['Consumed']),
    reason: (row['ShortType'] ?? '').trim(),
    occasion: text(row, 'ConsumptionNote'),
    location: text(row, 'Location'),
    paid: money(row, 'Price'),
    noteId: id(row, 'iNote'),
  };
}

export const parseConsumed = (csv: string): ConsumedBottle[] => parseCsv(csv).map(toConsumedBottle);

export const parseNotes = (csv: string): TastingNote[] => parseCsv(csv).map(toNote);

/**
 * How long after the bottle a note may be dated and still be matched to it.
 * Notes often get written up the next morning.
 */
export const NOTE_MATCH_DAYS = 3;

/**
 * Pairs each note with its bottle. CellarTracker's own link (iNote) wins.
 * A bottle it didn't link takes an unclaimed note for the same wine, dated on
 * the day or up to NOTE_MATCH_DAYS after, the nearest first. A note is never
 * paired with two bottles.
 */
export function matchNotes(
  bottles: readonly ConsumedBottle[],
  notes: readonly TastingNote[],
): Map<ConsumedBottle, TastingNote> {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const claimed = new Set<string>();
  const matches = new Map<ConsumedBottle, TastingNote>();

  for (const bottle of bottles) {
    const note = bottle.noteId ? byId.get(bottle.noteId) : undefined;
    if (!note) continue;
    matches.set(bottle, note);
    claimed.add(note.id);
  }

  for (const bottle of bottles) {
    if (matches.has(bottle) || bottle.date === null) continue;
    const drunk = bottle.date;

    const nearest = notes
      .filter((note) => !claimed.has(note.id) && note.wineId === bottle.wineId && note.date !== null)
      .map((note) => ({ note, gap: daysBetween(drunk, note.date!) }))
      .filter(({ gap }) => gap >= 0 && gap <= NOTE_MATCH_DAYS)
      .sort((a, b) => a.gap - b.gap)[0];

    if (!nearest) continue;
    matches.set(bottle, nearest.note);
    claimed.add(nearest.note.id);
  }

  return matches;
}

function wineInfo(from: WineInfo): WineInfo {
  const { wineId, wine, sortWine, vintage, isNonVintage, style, colour, country, region, subRegion, appellation, grape } = from;
  return { wineId, wine, sortWine, vintage, isNonVintage, style, colour, country, region, subRegion, appellation, grape };
}

/**
 * One entry per bottle (with its note, if any) and one per note left over.
 * The bottle's own description of the wine is used, as it's what was opened.
 */
export function buildEntries(
  bottles: readonly ConsumedBottle[],
  notes: readonly TastingNote[],
): Entry[] {
  const matches = matchNotes(bottles, notes);
  const matched = new Set([...matches.values()].map((note) => note.id));

  const fromBottles: Entry[] = bottles.map((bottle) => ({
    ...wineInfo(bottle),
    key: `ct-bottle-${bottle.id}`,
    source: 'CellarTracker',
    date: bottle.date,
    bottle: {
      id: bottle.id,
      size: bottle.size,
      reason: bottle.reason,
      occasion: bottle.occasion,
      location: bottle.location,
      paid: bottle.paid,
    },
    note: matches.get(bottle) ?? null,
  }));

  const fromNotes: Entry[] = notes
    .filter((note) => !matched.has(note.id))
    .map((note) => ({
      ...wineInfo(note),
      key: `ct-note-${note.id}`,
      source: 'CellarTracker',
      date: note.date,
      bottle: null,
      note,
    }));

  return [...fromBottles, ...fromNotes];
}

export type NotesTotals = {
  /** Every tasting note, whether or not a bottle went with it. */
  notes: number;
  /** Bottles that have left the cellar. */
  bottles: number;
  /** Notes with no bottle from the cellar. */
  notesWithoutBottle: number;
  /** Bottles nobody wrote up. */
  bottlesWithoutNote: number;
};

export function notesTotals(entries: readonly Entry[]): NotesTotals {
  return {
    notes: entries.filter((e) => e.note).length,
    bottles: entries.filter((e) => e.bottle).length,
    notesWithoutBottle: entries.filter((e) => e.note && !e.bottle).length,
    bottlesWithoutNote: entries.filter((e) => e.bottle && !e.note).length,
  };
}
