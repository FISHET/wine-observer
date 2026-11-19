/**
 * The CellarTracker tables behind each page. Kept free of Node imports, so
 * the browser bundle can use it as well as the API.
 */
import type { Table } from './cellartracker.ts';

export const CELLAR_TABLES: readonly Table[] = ['List'];
/** Purchase only supplies producers: Consumed has no Producer column. */
export const CONSUMED_TABLES: readonly Table[] = ['Consumed', 'Notes', 'Purchase'];
/**
 * The same as consumed: a Vivino tasting takes its wine's description from
 * the CellarTracker wine it matches, which may be known only from Consumed.
 */
export const SCORES_TABLES: readonly Table[] = CONSUMED_TABLES;
