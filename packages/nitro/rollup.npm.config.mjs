import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/index.ts', 'src/runtime/plugins/server.ts'],
      packageSpecificConfig: {
        external: [/^nitro/],
      },
    }),
    { emitCjs: false },
  ),
];
