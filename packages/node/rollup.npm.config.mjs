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
      entrypoints: [
        'src/index.ts',
        'src/init.ts',
        'src/preload.ts',
        // Combined Sentry bundler plugins + orchestrion code transform, exposed
        // ESM-only via the `@sentry/node/bundler-plugins/*` subpath exports
        // (they import the ESM-only `@sentry/server-utils/orchestrion/*` plugins).
        'src/bundler-plugins/vite.ts',
        'src/bundler-plugins/rollup.ts',
        'src/bundler-plugins/webpack.ts',
        'src/bundler-plugins/esbuild.ts',
      ],
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
