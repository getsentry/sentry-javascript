import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

const builds = [];

const browserPluggableIntegrationFiles = ['contextlines', 'httpclient', 'reportingobserver'];

const corePluggableIntegrationFiles = [
  'captureconsole',
  'debug',
  'dedupe',
  'extraerrordata',
  'rewriteframes',
  'sessiontiming',
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

corePluggableIntegrationFiles.forEach(integrationName => {
  const integrationsBundleConfig = makeBaseBundleConfig({
    bundleType: 'addon',
    entrypoints: [`src/integrations-bundle/index.${integrationName}.ts`],
    licenseTitle: `@sentry/browser - ${integrationName}`,
    outputFileBase: () => `bundles/${integrationName}`,
  });

  builds.push(...makeBundleConfigVariants(integrationsBundleConfig));
});

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

const tracingReplayFeedbackBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.tracing.replay.feedback.ts'],
  licenseTitle: '@sentry/browser (Performance Monitoring, Replay, and Feedback)',
  outputFileBase: () => 'bundles/bundle.tracing.replay.feedback',
});

builds.push(
  ...makeBundleConfigVariants(baseBundleConfig),
  ...makeBundleConfigVariants(tracingBaseBundleConfig),
  ...makeBundleConfigVariants(replayBaseBundleConfig),
  ...makeBundleConfigVariants(feedbackBaseBundleConfig),
  ...makeBundleConfigVariants(tracingReplayBaseBundleConfig),
  ...makeBundleConfigVariants(tracingReplayFeedbackBaseBundleConfig),
);

export default builds;
