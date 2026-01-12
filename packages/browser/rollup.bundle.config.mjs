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

const tracingBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring)',
  outputFileBase: () => 'bundles/bundle.tracing',
});

const replayBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.replay.ts'],
  licenseTitle: '@sentry/browser (Replay)',
  outputFileBase: () => 'bundles/bundle.replay',
});

const feedbackBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.feedback.ts'],
  licenseTitle: '@sentry/browser & @sentry/feedback',
  outputFileBase: () => 'bundles/bundle.feedback',
});

const tracingReplayBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.replay.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring and Replay)',
  outputFileBase: () => 'bundles/bundle.tracing.replay',
});

const replayFeedbackBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.replay.feedback.ts'],
  licenseTitle: '@sentry/browser (Replay, and Feedback)',
  outputFileBase: () => 'bundles/bundle.replay.feedback',
});

const tracingReplayFeedbackBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.replay.feedback.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring, Replay, and Feedback)',
  outputFileBase: () => 'bundles/bundle.tracing.replay.feedback',
});

const loggerBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.logger.ts'],
  licenseTitle: '@sentry/browser (Logger)',
  outputFileBase: () => 'bundles/bundle.logger',
});

const tracingLoggerBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.logger.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring and Logger)',
  outputFileBase: () => 'bundles/bundle.tracing.logger',
});

const replayLoggerBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.replay.logger.ts'],
  licenseTitle: '@sentry/browser (Replay and Logger)',
  outputFileBase: () => 'bundles/bundle.replay.logger',
});

const feedbackLoggerBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.feedback.logger.ts'],
  licenseTitle: '@sentry/browser (Feedback and Logger)',
  outputFileBase: () => 'bundles/bundle.feedback.logger',
});

const tracingReplayLoggerBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.replay.logger.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring, Replay, and Logger)',
  outputFileBase: () => 'bundles/bundle.tracing.replay.logger',
});

const replayFeedbackLoggerBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.replay.feedback.logger.ts'],
  licenseTitle: '@sentry/browser (Replay, Feedback, and Logger)',
  outputFileBase: () => 'bundles/bundle.replay.feedback.logger',
});

const tracingReplayFeedbackLoggerBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.replay.feedback.logger.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring, Replay, Feedback, and Logger)',
  outputFileBase: () => 'bundles/bundle.tracing.replay.feedback.logger',
});

builds.push(
  ...makeBundleConfigVariants(baseBundleConfig),
  ...makeBundleConfigVariants(tracingBaseBundleConfig),
  ...makeBundleConfigVariants(replayBaseBundleConfig),
  ...makeBundleConfigVariants(feedbackBaseBundleConfig),
  ...makeBundleConfigVariants(tracingReplayBaseBundleConfig),
  ...makeBundleConfigVariants(replayFeedbackBaseBundleConfig),
  ...makeBundleConfigVariants(tracingReplayFeedbackBaseBundleConfig),
  ...makeBundleConfigVariants(loggerBaseBundleConfig),
  ...makeBundleConfigVariants(tracingLoggerBaseBundleConfig),
  ...makeBundleConfigVariants(replayLoggerBaseBundleConfig),
  ...makeBundleConfigVariants(feedbackLoggerBaseBundleConfig),
  ...makeBundleConfigVariants(tracingReplayLoggerBaseBundleConfig),
  ...makeBundleConfigVariants(replayFeedbackLoggerBaseBundleConfig),
  ...makeBundleConfigVariants(tracingReplayFeedbackLoggerBaseBundleConfig),
);

export default builds;
