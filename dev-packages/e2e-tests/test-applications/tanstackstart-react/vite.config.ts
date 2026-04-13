import { defineConfig } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react-swc';
import { nitro } from 'nitro/vite';
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite';

const useTunnelRoute = process.env.E2E_TEST_USE_TUNNEL_ROUTE === '1';

const appDsn = useTunnelRoute ? 'http://public@localhost:3031/1337' : 'https://public@dsn.ingest.sentry.io/1337';

const appTunnel = useTunnelRoute ? '/monitor' : 'http://localhost:3031/';

export default defineConfig({
  server: {
    port: 3000,
  },
  define: {
    __APP_DSN__: JSON.stringify(appDsn),
    __APP_TUNNEL__: JSON.stringify(appTunnel),
  },
  plugins: [
    tsConfigPaths(),
    tanstackStart(),
    nitro(),
    // react's vite plugin must come after start's vite plugin
    viteReact(),
    sentryTanstackStart({
      org: process.env.E2E_TEST_SENTRY_ORG_SLUG,
      project: process.env.E2E_TEST_SENTRY_PROJECT,
      authToken: process.env.E2E_TEST_AUTH_TOKEN,
      debug: true,
    }),
  ],
});
