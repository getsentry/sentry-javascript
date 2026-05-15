import { defineConfig } from 'rollup';
import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoaders } from '@sentry-internal/rollup-utils';

// EXPERIMENTAL — orchestrion.js runtime hooks. Each one is a tiny hand-written
// `.mjs`/`.cjs` shim that the user references via `node --import` or
// `node --require`. We pass them through rollup only to copy them into `build/`
// at the path the package.json `exports` map expects; `external: /.*/` keeps
// every import (e.g. `@sentry/node/orchestrion/config`) as a runtime resolution
// against the installed package.
const orchestrionRuntimeHooks = [
  defineConfig({
    input: 'src/orchestrion/runtime/import-hook.mjs',
    external: /.*/,
    output: { format: 'esm', file: 'build/orchestrion/import-hook.mjs' },
  }),
  defineConfig({
    input: 'src/orchestrion/runtime/require-hook.cjs',
    external: /.*/,
    output: { format: 'cjs', file: 'build/orchestrion/require-hook.cjs', strict: false },
  }),
];

export default [
  ...makeOtelLoaders('./build', 'otel'),
  ...orchestrionRuntimeHooks,
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      // `src/orchestrion/config.ts` and `src/orchestrion/bundler/vite.ts` are
      // loaded via dedicated subpath exports (`@sentry/node/orchestrion/config`,
      // `@sentry/node/orchestrion/vite`) — neither is reachable from `src/index.ts`,
      // so we list them as separate entrypoints to guarantee they end up in
      // build/esm and build/cjs.
      entrypoints: [
        'src/index.ts',
        'src/init.ts',
        'src/preload.ts',
        'src/orchestrion/config.ts',
        'src/orchestrion/bundler/vite.ts',
      ],
      packageSpecificConfig: {
        external: [/^@sentry\/opentelemetry/],
        output: {
          // set exports to 'named' or 'auto' so that rollup doesn't warn
          exports: 'named',
          preserveModules: true,
        },
      },
    }),
  ),
];
