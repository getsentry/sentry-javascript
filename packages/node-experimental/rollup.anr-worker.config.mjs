import { makeBaseBundleConfig } from '@sentry-internal/rollup-utils';

export function createAnrWorkerCode() {
  let base64Code;

  return {
    workerRollupConfig: makeBaseBundleConfig({
      bundleType: 'node-worker',
      entrypoints: ['src/integrations/anr/worker.ts'],
      licenseTitle: '@sentry/node',
      outputFileBase: () => 'worker-script.js',
      packageSpecificConfig: {
        output: {
          dir: 'build/esm/integrations/anr',
          sourcemap: false,
        },
        plugins: [
          {
            name: 'output-base64-worker-script',
            renderChunk(code) {
              base64Code = Buffer.from(code).toString('base64');
            },
          },
        ],
      },
    }),
    getBase64Code() {
      return base64Code;
    },
  };
}
