import { defineConfig } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react-swc';
import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite';

export default defineConfig({
  server: {
    port: 3000,
  },
  define: {
    __APP_DSN__: JSON.stringify('https://public@dsn.ingest.sentry.io/1337'),
    __APP_TUNNEL__: JSON.stringify('http://localhost:3031/'),
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tsConfigPaths(),
    tanstackStart(),
    // react's vite plugin must come after start's vite plugin
    viteReact(),
    sentryTanstackStart({
      org: process.env.E2E_TEST_SENTRY_ORG_SLUG,
      project: process.env.E2E_TEST_SENTRY_PROJECT,
      authToken: process.env.E2E_TEST_AUTH_TOKEN,
      debug: true,
      // Both Sentry plugins inject the orchestrion snippet, and injecting it twice fails the build.
      buildTimeInstrumentation: false,
    }),
    sentryCloudflareVitePlugin(),
  ],
});
