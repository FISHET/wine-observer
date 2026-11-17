/**
 * A small .env reader.
 *
 * Node's built-in --env-file truncates a value at the first '#', even with no
 * whitespace before it, so a password like abc#def arrives as abc. That fails
 * as a plain "wrong credentials" error, which is a miserable thing to debug.
 * This parser follows the usual convention instead: '#' only starts a comment
 * at the start of a line or after whitespace, and quoted values are literal.
 */
import { readFileSync } from 'node:fs';

export function parseEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator).replace(/^export\s+/, '').trim();
    if (key === '') continue;

    values[key] = readValue(line.slice(separator + 1).trim());
  }

  return values;
}

function readValue(raw: string): string {
  const quote = raw[0];

  if (quote === '"' || quote === "'") {
    const closing = raw.lastIndexOf(quote);
    if (closing > 0) {
      const inner = raw.slice(1, closing);
      // Only double quotes interpret escapes, as in the shell.
      return quote === '"' ? inner.replace(/\\n/g, '\n').replace(/\\"/g, '"') : inner;
    }
  }

  // Unquoted: a '#' is only a comment when whitespace precedes it.
  return raw.replace(/\s+#.*$/, '').trim();
}

/**
 * Loads a .env file into process.env. Existing variables win, so a value set
 * in the real environment still overrides the file. A missing file is fine.
 */
export function loadEnv(path: string): void {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    return;
  }

  for (const [key, value] of Object.entries(parseEnv(contents))) {
    process.env[key] ??= value;
  }
}
