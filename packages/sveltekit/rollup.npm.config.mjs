import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: [
      'src/index.server.ts',
      'src/index.client.ts',
      'src/index.worker.ts',
      'src/client/index.ts',
      // Browser-tracing variants, kept as standalone entrypoints so the `sentrySvelteKit()` plugin
      // (or the `exports` fallback) can select one per SvelteKit version.
      'src/client/svelte4BrowserTracing.ts',
      'src/client/svelte5BrowserTracing.ts',
      'src/server/index.ts',
      'src/worker/index.ts',
      'src/vite/index.ts',
    ],
    packageSpecificConfig: {
      // Keep the variant subpath external so the transpiled output preserves the import for the
      // consumer to resolve (via `exports` or the `sentrySvelteKit()` plugin).
      external: ['$app/state', '$app/stores', '@sentry/sveltekit/browser-tracing-variant'],
      output: {
        dynamicImportInCjs: true,
      },
    },
  }),
);
