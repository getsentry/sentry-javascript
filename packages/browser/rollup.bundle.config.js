import { makeBaseBundleConfig, makeBundleConfigVariants } from '../rollup/index.js';

const builds = [];

const targets = process.env.JS_VERSION ? [process.env.JS_VERSION] : ['es5', 'es6'];

if (targets.some(target => target !== 'es5' && target !== 'es6')) {
  throw new Error('JS_VERSION must be either "es5" or "es6"');
}

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
    licenseTitle: '@sentry/browser & @sentry/tracing',
    outputFileBase: () => `bundles/bundle.tracing${jsVersion === 'es5' ? '.es5' : ''}`,
  });

  builds.push(...makeBundleConfigVariants(baseBundleConfig), ...makeBundleConfigVariants(tracingBaseBundleConfig));
});

if (targets.includes('es6')) {
  // Replay bundles only available for es6
  const replayBaseBundleConfig = makeBaseBundleConfig({
    bundleType: 'standalone',
    entrypoints: ['src/index.bundle.replay.ts'],
    jsVersion: 'es6',
    licenseTitle: '@sentry/browser & @sentry/replay',
    outputFileBase: () => 'bundles/bundle.replay',
  });

  const tracingReplayBaseBundleConfig = makeBaseBundleConfig({
    bundleType: 'standalone',
    entrypoints: ['src/index.bundle.tracing.replay.ts'],
    jsVersion: 'es6',
    licenseTitle: '@sentry/browser & @sentry/tracing & @sentry/replay',
    outputFileBase: () => 'bundles/bundle.tracing.replay',
  });

  builds.push(
    ...makeBundleConfigVariants(replayBaseBundleConfig),
    ...makeBundleConfigVariants(tracingReplayBaseBundleConfig),
  );
}

export default builds;
