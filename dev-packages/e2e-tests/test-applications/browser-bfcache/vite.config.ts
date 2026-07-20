import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Two separate HTML documents so a back/forward navigation between them is a genuine
    // cross-document history traversal that the browser can serve from bfcache.
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        page2: resolve(__dirname, 'page-2.html'),
      },
    },
  },
  // Expose the DSN the e2e harness injects to the app code, matching the `process.env.E2E_TEST_DSN`
  // convention used by the other browser test apps.
  define: {
    'process.env.E2E_TEST_DSN': JSON.stringify(process.env.E2E_TEST_DSN),
  },
});
