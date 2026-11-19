/**
 * Country names as CellarTracker and Vivino write them, to the codes the
 * flag-icons package names its flags by (ISO 3166-1 alpha-2, lower case, plus
 * the UK's nations). Pure, so it can be tested without a browser.
 */
const CODES: Record<string, string> = {
  argentina: 'ar',
  armenia: 'am',
  australia: 'au',
  austria: 'at',
  canada: 'ca',
  chile: 'cl',
  china: 'cn',
  croatia: 'hr',
  denmark: 'dk',
  england: 'gb-eng',
  france: 'fr',
  georgia: 'ge',
  germany: 'de',
  greece: 'gr',
  hungary: 'hu',
  israel: 'il',
  italy: 'it',
  japan: 'jp',
  lebanon: 'lb',
  mexico: 'mx',
  moldova: 'md',
  'new zealand': 'nz',
  portugal: 'pt',
  romania: 'ro',
  scotland: 'gb-sct',
  slovenia: 'si',
  'south africa': 'za',
  spain: 'es',
  switzerland: 'ch',
  thailand: 'th',
  turkey: 'tr',
  ukraine: 'ua',
  'united kingdom': 'gb',
  uk: 'gb',
  'united states': 'us',
  usa: 'us',
  uruguay: 'uy',
  wales: 'gb-wls',
};

/** The flag code for a country, or null when it isn't one we know. */
export function countryCode(country: string | null | undefined): string | null {
  return CODES[(country ?? '').trim().toLowerCase()] ?? null;
}
