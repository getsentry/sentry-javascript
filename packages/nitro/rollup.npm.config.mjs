import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';
import { glob } from 'glob';

const runtimeFiles = glob.sync('src/runtime/**/*.ts');

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/index.ts', ...runtimeFiles],
      packageSpecificConfig: {
        external: [/^nitropack/, /^h3/, /^#sentry/, /^#nitro-internal/],
      },
    }),
    { emitCjs: false },
  ),
];
