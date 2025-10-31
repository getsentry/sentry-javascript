/* eslint-disable import/no-named-as-default */
import nodeResolve from '@rollup/plugin-node-resolve';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    hasBundles: true,
    packageSpecificConfig: {
      output: {
        // set exports to 'named' or 'auto' so that rollup doesn't warn
        exports: 'named',
      },
    },
  }),
).concat(
  ['esm', 'cjs'].map(format => ({
    input: ['./src/worker-bundler.ts'],
    output: {
      file: `./build/npm/${format}/worker-bundler.js`,
      strict: false,
      format,
    },
    treeshake: false,
    plugins: [nodeResolve()],
  })),
);
