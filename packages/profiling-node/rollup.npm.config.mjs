import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    packageSpecificConfig: {
      output: {
        dir: 'build',
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
);
