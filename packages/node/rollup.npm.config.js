import { makeBaseBundleConfig, makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.js';

const anrWorkerConfig = makeBaseBundleConfig({
  bundleType: 'node-worker',
  entrypoints: ['src/integrations/anr/worker.ts'],
  jsVersion: 'es6',
  licenseTitle: '@sentry/node',
  outputFileBase: () => 'worker-script.js.ignore',
  packageSpecificConfig: {
    output: {
      dir: './src/integrations/anr',
      sourcemap: false,
    },
    plugins: [
      {
        name: 'output-worker-script',
        generateBundle(_, bundle) {
          const entry = Object.values(bundle).find(chunk => chunk.isEntry);
          this.emitFile({
            type: 'asset',
            fileName: 'worker-script.ts',
            source: `export const base64WorkerScript = '${Buffer.from(entry.code).toString('base64')}';`,
          });
        },
      },
    ],
  },
});

export default [anrWorkerConfig, ...makeNPMConfigVariants(makeBaseNPMConfig())];
