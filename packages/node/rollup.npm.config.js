import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.js';
import { anrWorkerConfigs } from './rollup.anr-worker.config.mjs';

export default [
  ...makeNPMConfigVariants(makeBaseNPMConfig()),
  // The ANR worker builds must come after the main build because they overwrite the worker-script.js file
  ...anrWorkerConfigs,
];
