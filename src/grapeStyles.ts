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
export const GRAPE_STYLES_FILE = 'grape-styles.json';

/** A hand-edited data file that doesn't parse. Its message says how to fix it. */
export class DataFileError extends Error {}

export function parseGrapeStyles(json: string): Map<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new DataFileError(
      `data/${GRAPE_STYLES_FILE} is not valid JSON: ${(error as Error).message}. ` +
        `It should look like { "French Champagne": "Champagne Blend" }.`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new DataFileError(
      `data/${GRAPE_STYLES_FILE} should be an object of style to grape, like { "French Champagne": "Champagne Blend" }.`,
    );
  }

  const styles = new Map<string, string>();
  for (const [style, grape] of Object.entries(parsed)) {
    if (typeof grape !== 'string' || grape.trim() === '') {
      throw new DataFileError(`data/${GRAPE_STYLES_FILE}: "${style}" should map to a grape name, not ${JSON.stringify(grape)}.`);
    }
    styles.set(style.trim(), grape.trim());
  }
  return styles;
}
