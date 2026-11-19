/**
 * The CellarTracker tables behind each page. Kept free of Node imports, so
 * the browser bundle can use it as well as the API.
 */
import type { Table } from './cellartracker.ts';

export const CELLAR_TABLES: readonly Table[] = ['List'];
/** Purchase only supplies producers: Consumed has no Producer column. */
export const CONSUMED_TABLES: readonly Table[] = ['Consumed', 'Notes', 'Purchase'];
