import { defineConfig } from 'rollup';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

// EXPERIMENTAL: NestJS orchestrion `--import` runtime hook. A hand-written
// `.mjs` shim referenced via `node --import @sentry/nestjs/import`. We pass it
// through rollup only to copy it into `build/import.mjs` at the path the
// package.json `exports` map expects; `external: /.*/` keeps every import (e.g.
// `@sentry/nestjs/orchestrion`) as a runtime resolution against the installed
// package.
const orchestrionRuntimeHooks = [
  defineConfig({
    input: 'src/import.mjs',
    external: /.*/,
    output: { format: 'esm', file: 'build/import.mjs' },
  }),
];

export default [
  ...orchestrionRuntimeHooks,
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      // `src/orchestrion/index.ts` is internal (NOT a public export). It's listed
      // as an entrypoint only to guarantee a stable `build/esm/orchestrion/index.js`
      // output path, which the `build/import.mjs` `--import` hook references via a
      // relative import to register the `nestjsOrchestrion` descriptor.
      entrypoints: ['src/index.ts', 'src/setup.ts', 'src/orchestrion/index.ts'],
    }),
  ),
];
