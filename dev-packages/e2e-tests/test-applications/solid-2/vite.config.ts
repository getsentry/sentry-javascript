import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    solid({
      ssr: true,
      // The production-speed runtime that keeps `OBSERVE` alive — what the
      // tracing integrations read. Errors report in every tier.
      observe: true,
      serverFunctions: true,
      start: {
        // Awaited to completion before the server graph loads: Sentry.init()
        // runs before @solidjs/web or the app are imported.
        instrument: './src/instrument.ts',
      },
    }),
  ],
});
