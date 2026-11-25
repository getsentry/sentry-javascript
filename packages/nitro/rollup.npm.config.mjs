import { makeBaseNPMConfig, makeNPMConfigVariants, makeOrchestrionLoader } from '@sentry-internal/rollup-utils';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/index.ts', 'src/runtime/plugins/server.ts'],
      packageSpecificConfig: {
        external: [/^nitro/, /^#nitro\//, /^srvx/, /^@sentry\/opentelemetry/],
      },
    }),
    { emitCjs: false },
  ),
  ...makeOrchestrionLoader('./build'),
];
