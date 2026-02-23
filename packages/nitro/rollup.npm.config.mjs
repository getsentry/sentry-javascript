import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/index.ts', 'src/runtime/plugins/server.ts'],
      packageSpecificConfig: {
        external: [/^nitro/, 'otel-tracing-channel', /^h3/, /^srvx/, '@sentry/bundler-plugin-core'],
      },
    }),
  ),
];
