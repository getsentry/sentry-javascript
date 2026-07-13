import { defineConfig } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react-swc';
import { nitro } from 'nitro/vite';
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';

const appDsn = 'http://public@localhost:3031/1337';

export default defineConfig({
  server: {
    port: 3000,
  },
  define: {
    __APP_DSN__: JSON.stringify(appDsn),
    __APP_TUNNEL__: JSON.stringify('http://localhost:3031/'),
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
    // Runs the orchestrion code transform over the server bundle and
    // force-bundles the instrumented deps (mysql, ioredis, …) so the
    // diagnostics-channel calls are actually injected.
    sentryOrchestrionPlugin(),
  ],
});
