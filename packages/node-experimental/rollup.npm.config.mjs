import replace from '@rollup/plugin-replace';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';
import { createAnrWorkerCode } from './rollup.anr-worker.config.mjs';

const { workerRollupConfig, getBase64Code } = createAnrWorkerCode();

export default [
  // The worker needs to be built first since it's output is used in the main bundle.
  workerRollupConfig,
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      packageSpecificConfig: {
        output: {
          // set exports to 'named' or 'auto' so that rollup doesn't warn
          exports: 'named',
          // set preserveModules to false because we want to bundle everything into one file.
          preserveModules: false,
        },
        plugins: [
          replace({
            delimiters: ['###', '###'],
            // removes some webpack warnings
            preventAssignment: true,
            values: {
              base64WorkerScript: () => getBase64Code(),
            },
          }),
        ],
      },
    }),
  ),
];
