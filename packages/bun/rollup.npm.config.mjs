import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    // `src/plugin.ts` backs the `@sentry/bun/plugin` subpath (the orchestrion
    // `bun build` plugin). It isn't reachable from `src/index.ts`, so we list it
    // as a separate entrypoint to get both ESM and CJS builds.
    entrypoints: ['src/index.ts', 'src/plugin.ts'],
  }),
);
