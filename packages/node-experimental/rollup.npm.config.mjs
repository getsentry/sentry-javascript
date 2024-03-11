import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';
import { anrWorkerConfigs } from './rollup.anr-worker.config.mjs';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      packageSpecificConfig: {
        output: {
          // set exports to 'named' or 'auto' so that rollup doesn't warn
          exports: 'named',
          // set preserveModules to false because we want to bundle everything into one file.
          preserveModules: false,
        },
        external: ['./worker-script.js'],
      },
    }),
  ),
  // The ANR worker builds must come after the main build because they overwrite the worker-script.js file
  ...anrWorkerConfigs,
];
