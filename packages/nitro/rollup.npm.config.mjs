import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/index.ts', 'src/runtime/plugins/server.ts'],
      packageSpecificConfig: {
        external: [/^nitro/, /^h3/, /^srvx/, /^@sentry\/opentelemetry/, '@sentry/bundler-plugin-core'],
      },
    }),
    { emitCjs: false },
  ),
];
