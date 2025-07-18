import nodeResolve from '@rollup/plugin-node-resolve';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    hasBundles: true,
    packageSpecificConfig: {
      output: {
        // set exports to 'named' or 'auto' so that rollup doesn't warn
        exports: 'named',
        // set preserveModules to false because for Replay we actually want
        // to bundle everything into one file.
        preserveModules:
          process.env.SENTRY_BUILD_PRESERVE_MODULES === undefined
            ? false
            : Boolean(process.env.SENTRY_BUILD_PRESERVE_MODULES),
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
