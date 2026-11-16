import { makeBaseBundleConfig } from '@sentry-internal/rollup-utils';

export function createWorkerCodeBuilder(entry, outDir) {
  let base64Code;

  return [
    makeBaseBundleConfig({
      bundleType: 'node-worker',
      entrypoints: [entry],
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
            // `output.minify` runs after `renderChunk`, so only `generateBundle` sees the minified code.
            generateBundle(_options, bundle) {
              const chunk = Object.values(bundle).find(output => output.type === 'chunk');
              base64Code = Buffer.from(chunk.code).toString('base64');
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
