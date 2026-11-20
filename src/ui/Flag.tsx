import { countryCode } from '../countries.ts';

/*
 * Flags from the flag-icons package (MIT). Images rather than emoji, because
 * Windows shows an emoji flag as two letters. Every flag's URL is bundled,
 * but a browser only fetches the ones a page shows.
 */
const FLAGS = import.meta.glob<string>('/node_modules/flag-icons/flags/4x3/*.svg', {
  eager: true,
  // no-inline: Vite would otherwise bake the small flags into the bundle as
  // data URIs, roughly doubling it. As files, only the ones shown are fetched.
  query: '?url&no-inline',
  import: 'default',
});

function flagUrl(code: string): string | null {
  return FLAGS[`/node_modules/flag-icons/flags/4x3/${code}.svg`] ?? null;
}

/** A small flag for a country, or nothing for one without a known flag. */
export function Flag({ country }: { country: string | undefined }) {
  const code = countryCode(country);
  const url = code ? flagUrl(code) : null;
  if (!url) return null;
  // The country is named in the alt text, so it isn't told by colour alone.
  return <img className="flag" src={url} alt={country} title={country} width={16} height={12} />;
}
