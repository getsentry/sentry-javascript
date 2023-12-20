import { makeBaseBundleConfig } from '@sentry-internal/rollup-utils';

export default makeBaseBundleConfig({
  bundleType: 'node-worker',
  entrypoints: ['src/integrations/anr/worker.ts'],
  jsVersion: 'es6',
  licenseTitle: '@sentry/node',
  outputFileBase: () => 'worker-script.ts',
  packageSpecificConfig: {
    output: {
      dir: './src/integrations/anr',
      sourcemap: false,
    },
    plugins: [
      {
        name: 'output-base64-worker-script',
        renderChunk(code) {
          return `export const base64WorkerScript = '${Buffer.from(code).toString('base64')}';`;
        },
      },
    ],
  },
});
