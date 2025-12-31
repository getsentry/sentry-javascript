import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
// VITE_SENTRY_SPOTLIGHT and VITE_E2E_TEST_DSN are set as env vars in package.json build script
// Vite automatically replaces import.meta.env.VITE_* with values from actual env vars
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
  },
  preview: {
    port: 3030,
  },
});
