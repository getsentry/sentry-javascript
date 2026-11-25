import { sentryVitePlugin } from '@sentry/node/vite';
import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    solid({
      start: {
        nodeServer: true,
        serverSetup: './src/instrument.server.ts',
        clientSetup: './src/instrument.client.ts',
      },
      ssr: true,
      serverFunctions: true,
      observe: process.env.SOLID_OBSERVE === '1',
    }),
    // Instruments the dependencies the server build bundles, such as `graphql`. No auth token, so nothing is uploaded.
    sentryVitePlugin({
      telemetry: false,
      sourcemaps: { disable: true },
      release: { create: false, finalize: false, inject: false },
    }),
  ],
  build: {
    target: 'esnext',
  },
  envPrefix: 'PUBLIC_',
});
