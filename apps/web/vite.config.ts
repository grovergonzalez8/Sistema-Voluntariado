import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'supabase-vendor',
              test: /node_modules[\\/]@supabase[\\/]/,
            },
            {
              name: 'react-vendor',
              test: /node_modules[\\/](?:@hookform|@tanstack|i18next|react|react-dom|react-hook-form|react-i18next|react-router|react-router-dom|zod)[\\/]/,
            },
          ],
        },
      },
    },
  },
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
});
