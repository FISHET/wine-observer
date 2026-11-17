import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // data/ sits outside src/, and the cellar export is imported from there.
    fs: { allow: ['.'] },
  },
});
