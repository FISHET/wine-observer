/**
 * Every wine drunk or tasted, one line per wine and vintage, from every app
 * it was checked in to.
 *
 * CellarTracker check-ins are its entries (a bottle consumed, or a note with
 * no bottle) grouped by iWine. Vivino check-ins are grouped by producer, name
 * and vintage. A Vivino wine is then merged into a CellarTracker one when the
 * vintages agree and the names match (see match.ts). Unsure pairs are left
 * apart: two lines for one wine is a nuisance, one line for two wines would
 * hide one.
 */
import { MATCH_THRESHOLD, nameMatch } from './match.ts';
import type { Entry } from './notes.ts';
import type { VivinoCheckIn } from './vivino.ts';
import { wineName } from './wine.ts';

export type Source = 'CellarTracker' | 'Vivino';

export type ConsumedWine = {
  key: string;
  /** The wine's own name, without the producer: "Lytton Springs". */
  name: string;
  /** Producer and name together, as CellarTracker writes it. */
  wine: string;
  sortWine: string;
  producer: string;
  sortProducer: string;
  vintage: number | null;
  isNonVintage: boolean;
  style: string;
  country: string;
  region: string | null;
  subRegion: string | null;
  appellation: string | null;
  grape: string | null;
  /**
   * Vivino's regional wine style, when the grape came from it rather than
   * from CellarTracker. If grape differs, the style was mapped (see
   * grapeStyles.ts); if they're equal, it hasn't been mapped yet.
   */
  vivinoStyle: string | null;
  /** Check-ins per app. */
  counts: Record<Source, number>;
  /**
   * Bottles consumed. Where both apps have the wine, the larger of the two
   * counts: a bottle was usually logged in both, so adding them would count
   * it twice.
   */
  bottles: number;
  /** ISO dates of the first and latest check-in, where any were dated. */
  firstDate: string | null;
  lastDate: string | null;
};

type Group<T> = { items: T[]; dates: string[] };

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string, dateOf: (item: T) => string | null) {
  const groups = new Map<string, Group<T>>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key) ?? { items: [], dates: [] };
    group.items.push(item);
    const date = dateOf(item);
    if (date) group.dates.push(date);
    groups.set(key, group);
  }
  return groups;
}

/** A blank Vivino vintage can only be the same wine as a non-vintage one. */
function sameVintage(checkIn: VivinoCheckIn, entry: Entry): boolean {
  return checkIn.vintage === null ? entry.isNonVintage : checkIn.vintage === entry.vintage;
}

const span = (dates: readonly string[]) => {
  const sorted = [...dates].sort();
  return { firstDate: sorted[0] ?? null, lastDate: sorted.at(-1) ?? null };
};

/** The grape for a Vivino style: mapped if the table has it, else the style as it is. */
function styleGrape(style: string | null, grapeStyles: ReadonlyMap<string, string>) {
  return { grape: style ? (grapeStyles.get(style) ?? style) : null, vivinoStyle: style };
}

export function buildConsumed(
  entries: readonly Entry[],
  checkIns: readonly VivinoCheckIn[],
  grapeStyles: ReadonlyMap<string, string> = new Map(),
): ConsumedWine[] {
  const cellarTracker = groupBy(entries, (e) => e.wineId, (e) => e.date);
  const vivino = groupBy(
    checkIns,
    (c) => `${c.producer}|${c.name}|${c.vintage ?? ''}`.toLowerCase(),
    (c) => c.date,
  );

  // Every plausible pairing, best first, then taken greedily so each wine
  // is merged at most once.
  const candidates: { vivinoKey: string; wineId: string; score: number }[] = [];
  for (const [vivinoKey, group] of vivino) {
    const checkIn = group.items[0]!;
    for (const [wineId, ct] of cellarTracker) {
      const entry = ct.items[0]!;
      if (!sameVintage(checkIn, entry)) continue;
      const score = nameMatch(
        { producer: checkIn.producer, wine: checkIn.name, region: checkIn.region },
        entry.wine,
      );
      if (score >= MATCH_THRESHOLD) candidates.push({ vivinoKey, wineId, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const partner = new Map<string, string>(); // wineId -> vivinoKey
  const taken = new Set<string>();
  for (const { vivinoKey, wineId } of candidates) {
    if (partner.has(wineId) || taken.has(vivinoKey)) continue;
    partner.set(wineId, vivinoKey);
    taken.add(vivinoKey);
  }

  const lines: ConsumedWine[] = [];

  for (const [wineId, ct] of cellarTracker) {
    const first = ct.items.find((e) => e.bottle) ?? ct.items[0]!;
    const partnerKey = partner.get(wineId);
    const viv = partnerKey ? vivino.get(partnerKey) : undefined;
    const counts = { CellarTracker: ct.items.length, Vivino: viv?.items.length ?? 0 };
    // Any check-in that knows the producer: a note may where the bottle didn't.
    const known = ct.items.find((e) => e.producer);
    const producer = known?.producer ?? viv?.items[0]?.producer ?? '';

    lines.push({
      key: `ct-${wineId}`,
      name: wineName(first.wine, producer, first.appellation ?? first.region),
      wine: first.wine,
      sortWine: first.sortWine,
      producer,
      sortProducer: known?.sortProducer ?? producer,
      vintage: first.vintage,
      isNonVintage: first.isNonVintage,
      style: first.style,
      country: first.country,
      region: first.region,
      subRegion: first.subRegion,
      appellation: first.appellation,
      // CellarTracker's grape where it has one; Vivino's style otherwise.
      ...(first.grape !== null
        ? { grape: first.grape, vivinoStyle: null }
        : styleGrape(viv?.items[0]?.wineStyle ?? null, grapeStyles)),
      counts,
      bottles: Math.max(counts.CellarTracker, counts.Vivino),
      ...span([...ct.dates, ...(viv?.dates ?? [])]),
    });
  }

  for (const [vivinoKey, group] of vivino) {
    if (taken.has(vivinoKey)) continue;
    const first = group.items[0]!;

    lines.push({
      key: `vivino-${vivinoKey}`,
      // Vivino already keeps the name apart from the winery.
      name: first.name || first.region || first.wine,
      wine: first.wine,
      sortWine: first.wine,
      producer: first.producer,
      sortProducer: first.producer,
      vintage: first.vintage,
      // Vivino can't say; see VivinoCheckIn.vintage.
      isNonVintage: false,
      style: first.style,
      country: first.country,
      region: first.region,
      subRegion: null,
      appellation: null,
      ...styleGrape(first.wineStyle, grapeStyles),
      counts: { CellarTracker: 0, Vivino: group.items.length },
      bottles: group.items.length,
      ...span(group.dates),
    });
  }

  return lines;
}

export type ConsumedTotals = {
  wines: number;
  bottles: number;
  /** Lines with check-ins in both apps. */
  inBoth: number;
  cellarTrackerOnly: number;
  vivinoOnly: number;
};

export function consumedTotals(lines: readonly ConsumedWine[]): ConsumedTotals {
  const both = lines.filter((l) => l.counts.CellarTracker > 0 && l.counts.Vivino > 0).length;
  return {
    wines: lines.length,
    bottles: lines.reduce((sum, l) => sum + l.bottles, 0),
    inBoth: both,
    cellarTrackerOnly: lines.filter((l) => l.counts.Vivino === 0).length,
    vivinoOnly: lines.filter((l) => l.counts.CellarTracker === 0).length,
  };
}

/** "CellarTracker", "Vivino" or "Both". */
export function sourceLabel(line: ConsumedWine): string {
  if (line.counts.CellarTracker > 0 && line.counts.Vivino > 0) return 'Both';
  return line.counts.CellarTracker > 0 ? 'CellarTracker' : 'Vivino';
}

/** Vivino styles shown as they are because the table doesn't map them yet. */
export function unmappedStyles(lines: readonly ConsumedWine[]): string[] {
  const styles = lines.flatMap((l) => (l.vivinoStyle !== null && l.grape === l.vivinoStyle ? [l.vivinoStyle] : []));
  return [...new Set(styles)].sort();
}
