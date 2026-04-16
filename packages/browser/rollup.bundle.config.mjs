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
  'instrumentlangchainembeddings',
];

browserPluggableIntegrationFiles.forEach(integrationName => {
  builds.push(
    ...makeBundleConfigVariants(() =>
      makeBaseBundleConfig({
        bundleType: 'addon',
        entrypoints: [`src/integrations/${integrationName}.ts`],
        licenseTitle: `@sentry/browser - ${integrationName}`,
        outputFileBase: () => `bundles/${integrationName}`,
      }),
    ),
  );
});

reexportedPluggableIntegrationFiles.forEach(integrationName => {
  builds.push(
    ...makeBundleConfigVariants(() =>
      makeBaseBundleConfig({
        bundleType: 'addon',
        entrypoints: [`src/integrations-bundle/index.${integrationName}.ts`],
        licenseTitle: `@sentry/browser - ${integrationName}`,
        outputFileBase: () => `bundles/${integrationName}`,
      }),
    ),
  );
});

// Bundle config for additional exports we don't want to include in the main SDK bundle
// if we need more of these, we can generalize the config as for pluggable integrations
builds.push(
  ...makeBundleConfigVariants(() =>
    makeBaseBundleConfig({
      bundleType: 'addon',
      entrypoints: ['src/pluggable-exports-bundle/index.multiplexedtransport.ts'],
      licenseTitle: '@sentry/browser - multiplexedtransport',
      outputFileBase: () => 'bundles/multiplexedtransport',
    }),
  ),
);

const baseBundleOptions = {
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.ts'],
  licenseTitle: '@sentry/browser',
  outputFileBase: () => 'bundles/bundle',
};

const feedbackBaseBundleOptions = {
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.feedback.ts'],
  licenseTitle: '@sentry/browser & @sentry/feedback',
  outputFileBase: () => 'bundles/bundle.feedback',
};

const logsMetricsBaseBundleOptions = {
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.logs.metrics.ts'],
  licenseTitle: '@sentry/browser (Logs and Metrics)',
  outputFileBase: () => 'bundles/bundle.logs.metrics',
};

const replayBaseBundleOptions = {
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.replay.ts'],
  licenseTitle: '@sentry/browser (Replay)',
  outputFileBase: () => 'bundles/bundle.replay',
};

const replayFeedbackBaseBundleOptions = {
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.replay.feedback.ts'],
  licenseTitle: '@sentry/browser (Replay, and Feedback)',
  outputFileBase: () => 'bundles/bundle.replay.feedback',
};

const replayLogsMetricsBaseBundleOptions = {
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.replay.logs.metrics.ts'],
  licenseTitle: '@sentry/browser (Replay, Logs, and Metrics)',
  outputFileBase: () => 'bundles/bundle.replay.logs.metrics',
};

// Tracing
const tracingBaseBundleOptions = {
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring)',
  outputFileBase: () => 'bundles/bundle.tracing',
};

const tracingLogsMetricsBaseBundleOptions = {
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.logs.metrics.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring, Logs, and Metrics)',
  outputFileBase: () => 'bundles/bundle.tracing.logs.metrics',
};

const tracingReplayBaseBundleOptions = {
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.replay.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring and Replay)',
  outputFileBase: () => 'bundles/bundle.tracing.replay',
};

const tracingReplayLogsMetricsBaseBundleOptions = {
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.replay.logs.metrics.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring, Replay, Logs, and Metrics)',
  outputFileBase: () => 'bundles/bundle.tracing.replay.logs.metrics',
};

const tracingReplayFeedbackBaseBundleOptions = {
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.replay.feedback.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring, Replay, and Feedback)',
  outputFileBase: () => 'bundles/bundle.tracing.replay.feedback',
};

const tracingReplayFeedbackLogsMetricsBaseBundleOptions = {
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.replay.feedback.logs.metrics.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring, Replay, Feedback, Logs, and Metrics)',
  outputFileBase: () => 'bundles/bundle.tracing.replay.feedback.logs.metrics',
};

builds.push(
  ...makeBundleConfigVariants(() => makeBaseBundleConfig(baseBundleOptions)),
  ...makeBundleConfigVariants(() => makeBaseBundleConfig(feedbackBaseBundleOptions)),
  ...makeBundleConfigVariants(() => makeBaseBundleConfig(logsMetricsBaseBundleOptions)),
  ...makeBundleConfigVariants(() => makeBaseBundleConfig(replayBaseBundleOptions)),
  ...makeBundleConfigVariants(() => makeBaseBundleConfig(replayFeedbackBaseBundleOptions)),
  ...makeBundleConfigVariants(() => makeBaseBundleConfig(replayLogsMetricsBaseBundleOptions)),
  ...makeBundleConfigVariants(() => makeBaseBundleConfig(tracingBaseBundleOptions)),
  ...makeBundleConfigVariants(() => makeBaseBundleConfig(tracingLogsMetricsBaseBundleOptions)),
  ...makeBundleConfigVariants(() => makeBaseBundleConfig(tracingReplayBaseBundleOptions)),
  ...makeBundleConfigVariants(() => makeBaseBundleConfig(tracingReplayLogsMetricsBaseBundleOptions)),
  ...makeBundleConfigVariants(() => makeBaseBundleConfig(tracingReplayFeedbackBaseBundleOptions)),
  ...makeBundleConfigVariants(() => makeBaseBundleConfig(tracingReplayFeedbackLogsMetricsBaseBundleOptions)),
);

export default builds;
