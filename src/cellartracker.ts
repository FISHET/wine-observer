/**
 * Talking to CellarTracker's xlquery export endpoint.
 *
 * Two things bite here and are handled deliberately:
 *  - the response is latin-1, not UTF-8 (otherwise Château and Télégraphe break)
 *  - the password travels in the query string, so it must never reach a log
 */

const EXPORT_ENDPOINT = 'https://www.cellartracker.com/xlquery.asp';

/** The export tables we care about. CellarTracker offers more. */
export const TABLES = ['List', 'Inventory', 'Notes', 'Purchase', 'Pending', 'Consumed'] as const;

export type Table = (typeof TABLES)[number];

export type Credentials = {
  user: string;
  password: string;
};

export function buildExportUrl(credentials: Credentials, table: Table): URL {
  const url = new URL(EXPORT_ENDPOINT);
  url.searchParams.set('User', credentials.user);
  url.searchParams.set('Password', credentials.password);
  url.searchParams.set('Format', 'csv');
  url.searchParams.set('Table', table);
  return url;
}

/** Safe to print: the password is replaced, everything else is kept. */
export function redact(url: URL): string {
  const copy = new URL(url);
  if (copy.searchParams.has('Password')) copy.searchParams.set('Password', '***');
  return copy.toString();
}

export function decodeLatin1(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

/**
 * CellarTracker answers 200 OK with an HTML page when credentials are wrong,
 * so the status code alone tells us nothing. A real export starts with a
 * header row containing iWine.
 */
export function isExport(text: string): boolean {
  const firstLine = text.slice(0, 2000).split(/\r?\n/, 1)[0] ?? '';
  return firstLine.includes('iWine');
}

/** Best-effort human-readable reason pulled out of a non-CSV response. */
export function explainFailure(text: string): string {
  const stripped = text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.slice(0, 300) || 'empty response';
}

export class CellarTrackerError extends Error {}

export async function fetchTable(
  credentials: Credentials,
  table: Table,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = buildExportUrl(credentials, table);

  const response = await fetchImpl(url, {
    headers: { Accept: 'text/csv,*/*' },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new CellarTrackerError(
      `CellarTracker returned ${response.status} ${response.statusText} for ${redact(url)}`,
    );
  }

  const text = decodeLatin1(await response.arrayBuffer());

  if (!isExport(text)) {
    throw new CellarTrackerError(
      `CellarTracker did not return the ${table} table. It said: ${explainFailure(text)}\n` +
        `Check CT_USER and CT_PASSWORD in .env.local. CT_USER must be your CellarTracker ` +
        `username, not your email address. Note that a wrong username, a wrong password ` +
        `and no credentials at all produce this same reply.`,
    );
  }

  return text;
}
