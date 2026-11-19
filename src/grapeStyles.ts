/**
 * Vivino has no grape field, only a "Regional wine style" such as "French
 * Champagne". This hand-maintained table, data/grape-styles.json, turns a
 * style into the grape CellarTracker would give: "Champagne Blend".
 *
 *   { "French Champagne": "Champagne Blend", ... }
 *
 * A style that isn't listed is shown as it is, and the consumed page lists
 * the ones still to map. It works by style, not by wine, so a Blanc de Blancs
 * Champagne still comes out as Champagne Blend; per-wine mapping is for later.
 */
import { parseNameMap } from './dataFile.ts';

export { DataFileError } from './dataFile.ts';

export const GRAPE_STYLES_FILE = 'grape-styles.json';

export function parseGrapeStyles(json: string): Map<string, string> {
  return parseNameMap(json, {
    file: GRAPE_STYLES_FILE,
    example: '{ "French Champagne": "Champagne Blend" }',
    valueIs: 'a grape name',
  });
}
