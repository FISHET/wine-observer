/** The name shown in the browser tab. Pure, so it can be tested without a browser. */
export const SITE_NAME = 'Wine Observer';

/** "Cellar - Wine Observer"; just the site name for the home page. */
export function pageTitle(page: string | null): string {
  return page ? `${page} - ${SITE_NAME}` : SITE_NAME;
}
