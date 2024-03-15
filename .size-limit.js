module.exports = [
  // Main browser webpack builds
  {
    name: '@sentry/browser (incl. Tracing, Replay, Feedback) - Webpack (gzipped)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, replayIntegration, browserTracingIntegration, feedbackIntegration }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay) - Webpack (gzipped)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, replayIntegration, browserTracingIntegration }',
    gzip: true,
    limit: '75 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay with Canvas) - Webpack (gzipped)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, replayIntegration, browserTracingIntegration, replayCanvasIntegration }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay) - Webpack with treeshaking flags (gzipped)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, replayIntegration, browserTracingIntegration }',
    gzip: true,
    limit: '75 KB',
    modifyWebpackConfig: function (config) {
      const webpack = require('webpack');
      config.plugins.push(
        new webpack.DefinePlugin({
          __SENTRY_DEBUG__: false,
          __RRWEB_EXCLUDE_SHADOW_DOM__: true,
          __RRWEB_EXCLUDE_IFRAME__: true,
          __SENTRY_EXCLUDE_REPLAY_WORKER__: true,
        }),
      );
      return config;
    },
  },
  {
    name: '@sentry/browser (incl. Tracing) - Webpack (gzipped)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, browserTracingIntegration }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser (incl. browserTracingIntegration) - Webpack (gzipped)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, browserTracingIntegration }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser (incl. feedbackIntegration) - Webpack (gzipped)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, feedbackIntegration }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser (incl. feedbackModalIntegration) - Webpack (gzipped)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, feedbackIntegration, feedbackModalIntegration }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser (incl. feedbackScreenshotIntegration) - Webpack (gzipped)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, feedbackIntegration, feedbackModalIntegration, feedbackScreenshotIntegration }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser (incl. sendFeedback) - Webpack (gzipped)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, sendFeedback }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser - Webpack (gzipped)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init }',
    gzip: true,
    limit: '90 KB',
  },

  // Browser CDN bundles
  {
    name: '@sentry/browser (incl. Tracing, Replay, Feedback) - CDN Bundle (gzipped)',
    path: 'packages/browser/build/bundles/bundle.tracing.replay.feedback.min.js',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay) - CDN Bundle (gzipped)',
    path: 'packages/browser/build/bundles/bundle.tracing.replay.min.js',
    gzip: true,
    limit: '75 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing) - CDN Bundle (gzipped)',
    path: 'packages/browser/build/bundles/bundle.tracing.min.js',
    gzip: true,
    limit: '40 KB',
  },
  {
    name: '@sentry/browser - CDN Bundle (gzipped)',
    path: 'packages/browser/build/bundles/bundle.min.js',
    gzip: true,
    limit: '30 KB',
  },

  // browser CDN bundles (non-gzipped)
  {
    name: '@sentry/browser (incl. Tracing, Replay) - CDN Bundle (minified & uncompressed)',
    path: 'packages/browser/build/bundles/bundle.tracing.replay.min.js',
    gzip: false,
    brotli: false,
    limit: '260 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing) - CDN Bundle (minified & uncompressed)',
    path: 'packages/browser/build/bundles/bundle.tracing.min.js',
    gzip: false,
    brotli: false,
    limit: '120 KB',
  },
  {
    name: '@sentry/browser - CDN Bundle (minified & uncompressed)',
    path: 'packages/browser/build/bundles/bundle.min.js',
    gzip: false,
    brotli: false,
    limit: '80 KB',
  },

  // React
  {
    name: '@sentry/react (incl. Tracing, Replay) - Webpack (gzipped)',
    path: 'packages/react/build/esm/index.js',
    import: '{ init, browserTracingIntegration, replayIntegration }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/react - Webpack (gzipped)',
    path: 'packages/react/build/esm/index.js',
    import: '{ init }',
    gzip: true,
    limit: '90 KB',
  },

  // Next.js
  // TODO: Re-enable these, when we figure out why they break...
  /*  {
    name: '@sentry/nextjs Client (incl. Tracing, Replay) - Webpack (gzipped)',
    path: 'packages/nextjs/build/esm/client/index.js',
    import: '{ init, browserTracingIntegration, replayIntegration }',
    gzip: true,
    limit: '110 KB',
  },
  {
    name: '@sentry/nextjs Client - Webpack (gzipped)',
    path: 'packages/nextjs/build/esm/client/index.js',
    import: '{ init }',
    gzip: true,
    limit: '57 KB',
  }, */
];
