/**
 * The hand-maintained lookup files in data/ (grape-styles.json,
 * regions.json): a JSON object of name to name. They're edited by hand, so a
 * mistake gets a message that names the file and says what it should be.
 */

/** A hand-edited data file that doesn't parse. Its message says how to fix it. */
export class DataFileError extends Error {}

type MapFile = {
  /** The file's name in data/: "regions.json". */
  file: string;
  /** A one-entry example of the right shape: { "Gigondas": "Southern Rhône" }. */
  example: string;
  /** What each value is, for the error: "a grape name". */
  valueIs: string;
};

export function parseNameMap(json: string, { file, example, valueIs }: MapFile): Map<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new DataFileError(
      `data/${file} is not valid JSON: ${(error as Error).message}. It should look like ${example}.`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new DataFileError(`data/${file} should be an object, like ${example}.`);
  }

  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new DataFileError(`data/${file}: "${key}" should map to ${valueIs}, not ${JSON.stringify(value)}.`);
    }
    map.set(key.trim(), value.trim());
  }
  return map;
}
