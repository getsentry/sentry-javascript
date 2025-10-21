import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';
import glob from 'glob';

// These files will only run in runtime unlike the rest of the package, and
// must be bundled in the final package as-is
const runtimeFiles = glob.sync('src/runtime/**/*.ts');

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/index.ts', 'src/plugins.ts', ...runtimeFiles],
      packageSpecificConfig: {
        external: [/^nitropack/, /^h3/, /^#sentry/, /^#nitro-internal/, /^#imports/],
      },
    }),
    { emitCjs: false },
  ),
];
