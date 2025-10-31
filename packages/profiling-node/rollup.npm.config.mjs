import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    packageSpecificConfig: {
      output: {
        dir: 'build',
        // set exports to 'named' or 'auto' so that rollup doesn't warn
        exports: 'named',
      },
    },
  }),
);
