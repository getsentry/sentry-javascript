import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: [
      'src/index.server.ts',
      'src/index.client.ts',
      'src/index.worker.ts',
      'src/client/index.ts',
      // Build-time-selected browser-tracing variants (resolved by the `sentrySvelteKit()` Vite
      // plugin via the `sentry-sveltekit-tracing` virtual module). Standalone entrypoints so each
      // emits its own file and only the matching one (+ its `$app/*` import) is bundled downstream.
      'src/client/svelte4BrowserTracing.ts',
      'src/client/svelte5BrowserTracing.ts',
      'src/server/index.ts',
      'src/worker/index.ts',
    ],
    packageSpecificConfig: {
      external: ['$app/state', '$app/stores', 'sentry-sveltekit-tracing'],
      output: {
        dynamicImportInCjs: true,
      },
    },
  }),
);
