import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      // `@cloudflare/think` pulls in `just-bash` -> `turndown`, whose Node build calls a bare
      // `require('@mixmark-io/domino')` at module scope when `DOMParser` is missing. workerd has no
      // `DOMParser` and no `require`, so the worker dies on startup before any handler runs. This is
      // upstream of Sentry — it reproduces with `cloudflare()` alone. `turndown` already ships a
      // browser build with that branch compiled out; point at it directly.
      turndown: 'turndown/lib/turndown.browser.es.js',
    },
  },
  plugins: [cloudflare(), sentryCloudflareVitePlugin()],
});
