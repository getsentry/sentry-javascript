import { makeBaseBundleConfig, makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.js';

export default [
  ...makeNPMConfigVariants(
    makeBaseBundleConfig({
      bundleType: 'node-worker',
      entrypoints: ['src/integrations/anr/worker.ts'],
      jsVersion: 'es6',
      licenseTitle: '@sentry/node',
      packageSpecificConfig: {
        output: {
          sourcemap: false,
        },
      },
    }),
  ),
  ...makeNPMConfigVariants(makeBaseNPMConfig()),
];
