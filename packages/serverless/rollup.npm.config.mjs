import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: ['src/index.aws.ts', 'src/index.gcp.ts'],
    // packages with bundles have a different build directory structure
    hasBundles: true,
  }),
);
