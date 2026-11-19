/**
 * Regions as you think of them, rather than as each app records them.
 *
 * CellarTracker gives a region, a sub-region and an appellation ("Rhône",
 * "Southern Rhône", "Châteauneuf-du-Pape"); Vivino gives one name, usually
 * the appellation ("Châteauneuf-du-Pape"), sometimes the region ("Rioja").
 * Left alone, the same wine country lands at different depths.
 *
 * data/regions.json maps any of those names to the region to count it under:
 *
 *   { "Châteauneuf-du-Pape": "Southern Rhône", "Côte-Rôtie": "Northern Rhône" }
 *
 * A wine is looked up by its most specific name first: appellation, then
 * sub-region, then region. One not in the table keeps its region as it is.
 */
import { parseNameMap } from './dataFile.ts';

export const REGIONS_FILE = 'regions.json';

export function parseRegions(json: string): Map<string, string> {
  return parseNameMap(json, {
    file: REGIONS_FILE,
    example: '{ "Châteauneuf-du-Pape": "Southern Rhône" }',
    valueIs: 'a region name',
  });
}

type Names = { region: string | null; subRegion: string | null; appellation: string | null };

/**
 * The region to count a wine under, and whether the table said so. Null when
 * the wine has no region at all.
 */
export function groupRegion(
  { region, subRegion, appellation }: Names,
  regions: ReadonlyMap<string, string>,
): { regionGroup: string | null; regionMapped: boolean } {
  for (const name of [appellation, subRegion, region]) {
    const mapped = name ? regions.get(name) : undefined;
    if (mapped) return { regionGroup: mapped, regionMapped: true };
  }
  return { regionGroup: region, regionMapped: false };
}
