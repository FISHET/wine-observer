import { join } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, type PluginOption } from 'vite';

import { createApi } from './src/api.ts';
import { loadEnv } from './src/env.ts';
import { dataDir, projectRoot } from './src/paths.ts';

/**
 * Runs the cellar API inside the dev server, so `npm run dev` is still one
 * command and dev doesn't need a proxy to a second process.
 */
function cellarApi(): PluginOption {
  return {
    name: 'cellar-api',
    configureServer(server) {
      loadEnv(join(projectRoot, '.env.local'));
      server.middlewares.use(createApi({ dataDir }));
    },
  };
}

export default defineConfig({
  plugins: [react(), cellarApi()],
});
