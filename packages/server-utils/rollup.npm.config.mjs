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
      // `src/orchestrion/config/index.ts` and the `src/orchestrion/bundler/*.ts`
      // plugins are loaded via dedicated subpath exports (`.../orchestrion/config`,
      // `.../orchestrion/vite`, etc.) — none are reachable from `src/index.ts`, so
      // we list them as separate entrypoints to guarantee they end up in build/esm
      // and build/cjs. `src/orchestrion/index.ts` backs the `./orchestrion`
      // subpath export.
      entrypoints: [
        'src/index.ts',
        'src/orchestrion/index.ts',
        'src/orchestrion/config/index.ts',
        // `src/orchestrion/runtime/register.ts` backs the `./orchestrion/register`
        // subpath export; the Node SDK `require`s it synchronously from
        // `Sentry.init()` to install the channel-injection hooks.
        'src/orchestrion/runtime/register.ts',
        'src/orchestrion/bundler/vite.ts',
        'src/orchestrion/bundler/rollup.ts',
        'src/orchestrion/bundler/webpack.ts',
        'src/orchestrion/bundler/esbuild.ts',
      ],
      packageSpecificConfig: {
        output: {
          // set exports to 'named' or 'auto' so that rollup doesn't warn
          exports: 'named',
          // set preserveModules to true because we don't want to bundle everything into one file.
          preserveModules: true,
          // `@apm-js-collab/code-transformer-bundler-plugins` and `@apm-js-collab/tracing-hooks`
          // ship CJS entries as bare `module.exports = fn`/`= class` with no `__esModule`/`.default`.
          // The repo default `interop: 'esModule'` assumes ESM-shaped externals and would dereference
          // a nonexistent `.default`, so a default import compiles to `codeTransformer.default(...)` /
          // `ModulePatch.default(...)` → "not a function"/"not a constructor". Use 'auto' for just
          // these so Rollup emits its interop helper. Scoped here (not repo-wide) because 'auto' also
          // turns `import * as x` into a copy, which breaks in-place monkey-patching that other
          // packages (e.g. the OTel fs instrumentation) depend on.
          interop: id =>
            id?.startsWith('@apm-js-collab/code-transformer-bundler-plugins') || id?.startsWith('@apm-js-collab/tracing-hooks')
              ? 'auto'
              : 'esModule',
        },
      },
    }),
  ),
];
