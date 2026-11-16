import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react-swc';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tanstackStart({ router: { basepath: '/app' } }),
    nitro(),
    viteReact(),
    sentryTanstackStart({
      // A fixed path in the `static` variant, otherwise the one derived from the DSN.
      tunnelRoute: process.env.E2E_TEST_TUNNEL_ROUTE || true,
      sourcemaps: { disable: true },
    }),
  ],
});
