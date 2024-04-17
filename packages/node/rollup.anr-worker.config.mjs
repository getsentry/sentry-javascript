import { makeBaseBundleConfig } from '@sentry-internal/rollup-utils';

export function createWorkerCodeBuilder(entry, outDir) {
  let base64Code;

  return [
    makeBaseBundleConfig({
      bundleType: 'node-worker',
      entrypoints: [entry],
      sucrase: { disableESTransforms: true },
      licenseTitle: '@sentry/node',
      outputFileBase: () => 'worker-script.js',
      packageSpecificConfig: {
        output: {
          dir: outDir,
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
    () => {
      return base64Code;
    },
  ];
}
