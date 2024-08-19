import { builtinModules } from 'module';
import { makeBaseBundleConfig, plugins } from '@sentry-internal/rollup-utils';
import { rollup } from 'rollup';

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

export async function getBase64WorkerCode(entry) {
  const bundle = await rollup({
    input: entry,
    plugins: [plugins.makeSucrasePlugin(), plugins.makeTerserPlugin()],
    external: builtinModules,
  });

  const { output } = await bundle.generate({ format: 'es' });

  if (output.length !== 1) {
    throw new Error('Expected output to have length 1');
  }

  return Buffer.from(output[0].code).toString('base64');
}
