import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

const builds = [];

const browserPluggableIntegrationFiles = ['contextlines', 'httpclient', 'reportingobserver', 'browserprofiling'];

const reexportedPluggableIntegrationFiles = [
  'captureconsole',
  'dedupe',
  'extraerrordata',
  'rewriteframes',
  'feedback',
  'modulemetadata',
  'graphqlclient',
  'spotlight',
  'instrumentanthropicaiclient',
  'instrumentopenaiclient',
  'instrumentgooglegenaiclient',
  'instrumentlanggraph',
  'createlangchaincallbackhandler',
];

browserPluggableIntegrationFiles.forEach(integrationName => {
  const integrationsBundleConfig = makeBaseBundleConfig({
    bundleType: 'addon',
    entrypoints: [`src/integrations/${integrationName}.ts`],
    licenseTitle: `@sentry/browser - ${integrationName}`,
    outputFileBase: () => `bundles/${integrationName}`,
  });

  builds.push(...makeBundleConfigVariants(integrationsBundleConfig));
});

reexportedPluggableIntegrationFiles.forEach(integrationName => {
  const integrationsBundleConfig = makeBaseBundleConfig({
    bundleType: 'addon',
    entrypoints: [`src/integrations-bundle/index.${integrationName}.ts`],
    licenseTitle: `@sentry/browser - ${integrationName}`,
    outputFileBase: () => `bundles/${integrationName}`,
  });

  builds.push(...makeBundleConfigVariants(integrationsBundleConfig));
});

// Bundle config for additional exports we don't want to include in the main SDK bundle
// if we need more of these, we can generalize the config as for pluggable integrations
builds.push(
  ...makeBundleConfigVariants(
    makeBaseBundleConfig({
      bundleType: 'addon',
      entrypoints: ['src/pluggable-exports-bundle/index.multiplexedtransport.ts'],
      licenseTitle: '@sentry/browser - multiplexedtransport',
      outputFileBase: () => 'bundles/multiplexedtransport',
    }),
  ),
);

const baseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.ts'],
  licenseTitle: '@sentry/browser',
  outputFileBase: () => 'bundles/bundle',
});

const feedbackBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.feedback.ts'],
  licenseTitle: '@sentry/browser & @sentry/feedback',
  outputFileBase: () => 'bundles/bundle.feedback',
});

const logsMetricsBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.logs.metrics.ts'],
  licenseTitle: '@sentry/browser (Logs and Metrics)',
  outputFileBase: () => 'bundles/bundle.logs.metrics',
});

const replayBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.replay.ts'],
  licenseTitle: '@sentry/browser (Replay)',
  outputFileBase: () => 'bundles/bundle.replay',
});

const replayFeedbackBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.replay.feedback.ts'],
  licenseTitle: '@sentry/browser (Replay, and Feedback)',
  outputFileBase: () => 'bundles/bundle.replay.feedback',
});

const replayLogsMetricsBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.replay.logs.metrics.ts'],
  licenseTitle: '@sentry/browser (Replay, Logs, and Metrics)',
  outputFileBase: () => 'bundles/bundle.replay.logs.metrics',
});

// Tracing
const tracingBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring)',
  outputFileBase: () => 'bundles/bundle.tracing',
});

const tracingLogsMetricsBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.logs.metrics.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring, Logs, and Metrics)',
  outputFileBase: () => 'bundles/bundle.tracing.logs.metrics',
});

const tracingReplayBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.replay.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring and Replay)',
  outputFileBase: () => 'bundles/bundle.tracing.replay',
});

const tracingReplayLogsMetricsBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.replay.logs.metrics.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring, Replay, Logs, and Metrics)',
  outputFileBase: () => 'bundles/bundle.tracing.replay.logs.metrics',
});

const tracingReplayFeedbackBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.replay.feedback.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring, Replay, and Feedback)',
  outputFileBase: () => 'bundles/bundle.tracing.replay.feedback',
});

const tracingReplayFeedbackLogsMetricsBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.replay.feedback.logs.metrics.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring, Replay, Feedback, Logs, and Metrics)',
  outputFileBase: () => 'bundles/bundle.tracing.replay.feedback.logs.metrics',
});

builds.push(
  ...makeBundleConfigVariants(baseBundleConfig),
  ...makeBundleConfigVariants(feedbackBaseBundleConfig),
  ...makeBundleConfigVariants(logsMetricsBaseBundleConfig),
  ...makeBundleConfigVariants(replayBaseBundleConfig),
  ...makeBundleConfigVariants(replayFeedbackBaseBundleConfig),
  ...makeBundleConfigVariants(replayLogsMetricsBaseBundleConfig),
  ...makeBundleConfigVariants(tracingBaseBundleConfig),
  ...makeBundleConfigVariants(tracingLogsMetricsBaseBundleConfig),
  ...makeBundleConfigVariants(tracingReplayBaseBundleConfig),
  ...makeBundleConfigVariants(tracingReplayLogsMetricsBaseBundleConfig),
  ...makeBundleConfigVariants(tracingReplayFeedbackBaseBundleConfig),
  ...makeBundleConfigVariants(tracingReplayFeedbackLogsMetricsBaseBundleConfig),
);

export default builds;
