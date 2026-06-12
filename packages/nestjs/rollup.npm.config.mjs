import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: ['src/index.ts', 'src/setup.ts'],
    packageSpecificConfig: {
      output: {
        // keep emitted module paths relative to `src` so the bundled `@sentry/conventions`
        // (a devDependency, vendored into the build) doesn't shift the output layout
        preserveModulesRoot: 'src',
      },
    },
  }),
);
