import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoaders } from '@sentry-internal/rollup-utils';

export default [
  // `injectDiagnosticsChannel` makes the generated `@sentry/node/import` hook
  // also register the diagnostics-channel injection, so `node --import
  // @sentry/node/import app.js` injects the channels unconditionally (they are
  // only subscribed to when the app opts in via
  // `experimentalUseDiagnosticsChannelInjection()`).
  ...makeOtelLoaders('./build', 'otel', { injectDiagnosticsChannel: true }),
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/index.ts', 'src/init.ts', 'src/preload.ts'],
      packageSpecificConfig: {
        external: [/^@sentry\/opentelemetry/],
        output: {
          // set exports to 'named' or 'auto' so that rollup doesn't warn
          exports: 'named',
          preserveModules: true,
        },
      },
    }),
  ),
];
