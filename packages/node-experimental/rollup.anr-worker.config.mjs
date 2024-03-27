import { makeBaseBundleConfig } from '@sentry-internal/rollup-utils';

function createAnrWorkerConfig(destDir, esm) {
  return makeBaseBundleConfig({
    bundleType: 'node-worker',
    entrypoints: ['src/integrations/anr/worker.ts'],
    licenseTitle: '@sentry/node',
    outputFileBase: () => 'worker-script.js',
    packageSpecificConfig: {
      output: {
        dir: destDir,
        sourcemap: false,
      },
      plugins: [
        {
          name: 'output-base64-worker-script',
          renderChunk(code) {
            const base64Code = Buffer.from(code).toString('base64');
            if (esm) {
              return `export const base64WorkerScript = '${base64Code}';`;
            } else {
              return `exports.base64WorkerScript = '${base64Code}';`;
            }
          },
        },
      ],
    },
  });
}

export const anrWorkerConfigs = [
  createAnrWorkerConfig('build/esm/integrations/anr', true),
  createAnrWorkerConfig('build/cjs/integrations/anr', false),
];
