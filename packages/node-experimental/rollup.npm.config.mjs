import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';
import { createAnrWorkerCode } from './rollup.anr-worker.config.mjs';

const { workerRollupConfig, getBase64Code } = createAnrWorkerCode();

function trimPackageJson() {
  return {
    name: 'trim-package-json',

    transform(code, id) {
      if (!id.endsWith('package.json')) return null;

      try {
        const parsed = JSON.parse(code);
        if (typeof parsed.name === 'string' && typeof parsed.version === 'string') {
          return `{"name":"${parsed.name}","version":"${parsed.version}"}`;
        }
      } catch (err) {
        //
      }
      return null;
    },
  };
}

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

          interop: 'compat',

          manualChunks: id => {
            if (id.includes('node_modules')) {
              return 'otel';
            }
          },
          chunkFileNames: '[name].js',
        },
        plugins: [
          commonjs(),
          trimPackageJson(),
          json(),
          replace({
            delimiters: ['', ''],
            preventAssignment: false,
            values: {
              'new ImportInTheMiddle(': 'new ImportInTheMiddle.default(',
            },
          }),
          replace({
            delimiters: ['###', '###'],
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
