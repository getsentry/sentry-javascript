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
        iframe: resolve(__dirname, 'iframe.html'),
      },
    },
  },
  // Expose the DSN the e2e harness injects to the app code, matching the `process.env.E2E_TEST_DSN`
  // convention used by the other browser test apps.
  define: {
    'process.env.E2E_TEST_DSN': JSON.stringify(process.env.E2E_TEST_DSN),
  },
  plugins: [
    {
      // The `?botch=nostore` case needs the document served with `Cache-Control: no-store`; a later
      // cookie mutation then makes the browser evict the CCNS page from bfcache. Neither the header
      // nor the cookie change blocks on its own - only the combination does. A static server can't
      // set per-request headers, so add it here for that URL only.
      name: 'bfcache-nostore-headers',
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.includes('botch=nostore')) {
            res.setHeader('Cache-Control', 'no-store');
            // vite's static handler runs after this and would otherwise reset Cache-Control to
            // `no-cache`, so lock the header for this request only.
            const originalSetHeader = res.setHeader.bind(res);
            res.setHeader = (name, value) => {
              if (String(name).toLowerCase() === 'cache-control') {
                return res;
              }

              return originalSetHeader(name, value);
            };
          }
          next();
        });
      },
    },
  ],
});
