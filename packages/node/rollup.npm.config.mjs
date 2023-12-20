import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';
import { anrWorkerConfigs } from './rollup.anr-worker.config.mjs';

export default [
  ...makeNPMConfigVariants(makeBaseNPMConfig()),
  // The ANR worker builds must come after the main build because they overwrite the worker-script.js file
  ...anrWorkerConfigs,
];
