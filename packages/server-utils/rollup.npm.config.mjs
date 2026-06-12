import { defineConfig } from 'rollup';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

// EXPERIMENTAL — orchestrion.js runtime hook. A hand-written `.mjs` shim that
// SDKs reference via a `--import .../orchestrion/import-hook` flag. We pass it
// through rollup only to copy it into `build/orchestrion/` at the path the
// package.json `exports` map expects; `external: /.*/` keeps every import (e.g.
// `@sentry/server-utils/orchestrion/config`) as a runtime resolution
// against the installed package.
const orchestrionRuntimeHooks = [
  defineConfig({
    input: 'src/orchestrion/runtime/import-hook.mjs',
    external: /.*/,
    output: { format: 'esm', file: 'build/orchestrion/import-hook.mjs' },
  }),
];

export default [
  ...orchestrionRuntimeHooks,
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      // `src/orchestrion/config.ts` and `src/orchestrion/bundler/vite.ts` are
      // loaded via dedicated subpath exports (`.../orchestrion/config`,
      // `.../orchestrion/vite`) — neither is reachable from `src/index.ts`, so we
      // list them as separate entrypoints to guarantee they end up in build/esm
      // and build/cjs. `src/orchestrion/index.ts` backs the `./orchestrion`
      // subpath export.
      entrypoints: [
        'src/index.ts',
        'src/orchestrion/index.ts',
        'src/orchestrion/config.ts',
        'src/orchestrion/bundler/vite.ts',
        'src/orchestrion/bundler/bun.ts',
      ],
      packageSpecificConfig: {
        output: {
          // set exports to 'named' or 'auto' so that rollup doesn't warn
          exports: 'named',
          // set preserveModules to true because we don't want to bundle everything into one file.
          preserveModules:
            process.env.SENTRY_BUILD_PRESERVE_MODULES === undefined
              ? true
              : Boolean(process.env.SENTRY_BUILD_PRESERVE_MODULES),
        },
      },
    }),
  ),
];
