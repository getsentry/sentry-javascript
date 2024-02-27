import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

const builds = [];

const targets = process.env.JS_VERSION ? [process.env.JS_VERSION] : ['es5', 'es6'];

if (targets.some(target => target !== 'es5' && target !== 'es6')) {
  throw new Error('JS_VERSION must be either "es5" or "es6"');
}

const browserPluggableIntegrationFiles = ['contextlines', 'httpclient', 'reportingobserver'];

const coreIntegrationFiles = ['captureconsole', 'debug', 'dedupe', 'extraerrordata', 'rewriteframes', 'sessiontiming'];

targets.forEach(jsVersion => {
  const baseBundleConfig = makeBaseBundleConfig({
    bundleType: 'standalone',
    entrypoints: ['src/index.bundle.ts'],
    jsVersion,
    licenseTitle: '@sentry/browser',
    outputFileBase: () => `bundles/bundle${jsVersion === 'es5' ? '.es5' : ''}`,
  });

  const tracingBaseBundleConfig = makeBaseBundleConfig({
    bundleType: 'standalone',
    entrypoints: ['src/index.bundle.tracing.ts'],
    jsVersion,
    licenseTitle: '@sentry/browser (Performance Monitoring)',
    outputFileBase: () => `bundles/bundle.tracing${jsVersion === 'es5' ? '.es5' : ''}`,
  });

  browserPluggableIntegrationFiles.forEach(integrationName => {
    const integrationsBundleConfig = makeBaseBundleConfig({
      bundleType: 'addon',
      entrypoints: [`src/integrations/${integrationName}.ts`],
      jsVersion,
      licenseTitle: `@sentry/browser - ${integrationName}`,
      outputFileBase: () => `bundles/${integrationName}${jsVersion === 'es5' ? '.es5' : ''}`,
    });

    builds.push(...makeBundleConfigVariants(integrationsBundleConfig));
  });

  coreIntegrationFiles.forEach(integrationName => {
    const integrationsBundleConfig = makeBaseBundleConfig({
      bundleType: 'addon',
      entrypoints: [`src/integrations-bundle/index.${integrationName}.ts`],
      jsVersion,
      licenseTitle: `@sentry/browser - ${integrationName}`,
      outputFileBase: () => `bundles/${integrationName}${jsVersion === 'es5' ? '.es5' : ''}`,
    });

    builds.push(...makeBundleConfigVariants(integrationsBundleConfig));
  });

  builds.push(...makeBundleConfigVariants(baseBundleConfig), ...makeBundleConfigVariants(tracingBaseBundleConfig));
});

if (targets.includes('es6')) {
  // Replay/Feedback bundles only available for es6
  const replayBaseBundleConfig = makeBaseBundleConfig({
    bundleType: 'standalone',
    entrypoints: ['src/index.bundle.replay.ts'],
    jsVersion: 'es6',
    licenseTitle: '@sentry/browser & @sentry/replay',
    outputFileBase: () => 'bundles/bundle.replay',
  });

  const feedbackBaseBundleConfig = makeBaseBundleConfig({
    bundleType: 'standalone',
    entrypoints: ['src/index.bundle.feedback.ts'],
    jsVersion: 'es6',
    licenseTitle: '@sentry/browser & @sentry/feedback',
    outputFileBase: () => 'bundles/bundle.feedback',
  });

  const tracingReplayBaseBundleConfig = makeBaseBundleConfig({
    bundleType: 'standalone',
    entrypoints: ['src/index.bundle.tracing.replay.ts'],
    jsVersion: 'es6',
    licenseTitle: '@sentry/browser (Performance Monitoring and Replay)',
    outputFileBase: () => 'bundles/bundle.tracing.replay',
  });

  const tracingReplayFeedbackBaseBundleConfig = makeBaseBundleConfig({
    bundleType: 'standalone',
    entrypoints: ['src/index.bundle.tracing.replay.feedback.ts'],
    jsVersion: 'es6',
    licenseTitle: '@sentry/browser (Performance Monitoring, Replay, and Feedback)',
    outputFileBase: () => 'bundles/bundle.tracing.replay.feedback',
  });

  builds.push(
    ...makeBundleConfigVariants(replayBaseBundleConfig),
    ...makeBundleConfigVariants(feedbackBaseBundleConfig),
    ...makeBundleConfigVariants(tracingReplayBaseBundleConfig),
    ...makeBundleConfigVariants(tracingReplayFeedbackBaseBundleConfig),
  );
}

export default builds;
