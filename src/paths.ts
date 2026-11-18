import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root, found relative to this file rather than the cwd. */
export const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export const dataDir = join(projectRoot, 'data');

/** Where `npm run build` puts the app, and where the server serves it from. */
export const distDir = join(projectRoot, 'dist');
