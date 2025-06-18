import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: ['src/index.ts', 'src/thread-blocked-watchdog.ts'],
    packageSpecificConfig: {
      output: {
        dir: 'build',
        // set exports to 'named' or 'auto' so that rollup doesn't warn
        exports: 'named',
        preserveModules: true
      },
    },
  }),
);
