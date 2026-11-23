import { defineConfig } from 'rolldown';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

// The `@sentry/bun/import` entry (`bun --preload @sentry/bun/import app.ts`), which registers
// the orchestrion diagnostics-channel injection before the app loads.
const orchestrionRuntimeHook = defineConfig({
  input: 'src/import.mjs',
  external: /.*/,
  output: { format: 'esm', file: 'build/import.mjs' },
});

export default [
  orchestrionRuntimeHook,
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      // `src/plugin.ts` backs the `@sentry/bun/plugin` subpath (the orchestrion
      // `bun build` plugin). It isn't reachable from `src/index.ts`, so we list it
      // as a separate entrypoint to get both ESM and CJS builds.
      entrypoints: ['src/index.ts', 'src/plugin.ts'],
    }),
  ),
];
