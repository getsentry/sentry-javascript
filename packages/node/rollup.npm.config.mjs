import { defineConfig } from 'rollup';
import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoaders } from '@sentry-internal/rollup-utils';

// EXPERIMENTAL — orchestrion.js runtime hook. A tiny hand-written `.mjs` shim
// that the user references via `node --import @sentry/node/orchestrion`. It
// installs both the ESM loader and a `Module.prototype._compile` patch, so it
// also covers CJS-internal `require()` calls — no separate `--require` hook is
// needed. We pass it through rollup only to copy it into `build/` at the path
// the package.json `exports` map expects; `external: /.*/` keeps every import
// (e.g. `@sentry/server-utils/orchestrion/import-hook`) as a runtime
// resolution against the installed package.
const orchestrionRuntimeHooks = [
  defineConfig({
    input: 'src/orchestrion/runtime/import-hook.mjs',
    external: /.*/,
    output: { format: 'esm', file: 'build/orchestrion/import-hook.mjs' },
  }),
];

export default [
  ...makeOtelLoaders('./build', 'otel'),
  ...orchestrionRuntimeHooks,
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      // `src/orchestrion/bundler/vite.ts` is loaded via the dedicated
      // `@sentry/node/orchestrion/vite` subpath export and is not reachable from
      // `src/index.ts`, so we list it as a separate entrypoint to guarantee it
      // ends up in build/esm and build/cjs.
      entrypoints: ['src/index.ts', 'src/init.ts', 'src/preload.ts', 'src/orchestrion/bundler/vite.ts'],
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
