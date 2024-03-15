module.exports = [
  // Main browser webpack builds
  {
    name: '@sentry/browser (incl. Tracing, Replay, Feedback)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, replayIntegration, browserTracingIntegration, feedbackIntegration }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, replayIntegration, browserTracingIntegration }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay with Canvas)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, replayIntegration, browserTracingIntegration, replayCanvasIntegration }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay) - with treeshaking flags',
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
    name: '@sentry/browser (incl. Tracing)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, browserTracingIntegration }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser (incl. browserTracingIntegration)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, browserTracingIntegration }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser (incl. feedbackIntegration)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, feedbackIntegration }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser (incl. feedbackModalIntegration)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, feedbackIntegration, feedbackModalIntegration }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser (incl. feedbackScreenshotIntegration)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, feedbackIntegration, feedbackModalIntegration, feedbackScreenshotIntegration }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser (incl. sendFeedback)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, sendFeedback }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init }',
    gzip: true,
    limit: '90 KB',
  },

  // Browser CDN bundles
  {
    name: 'CDN Bundle (incl. Tracing, Replay, Feedback)',
    path: 'packages/browser/build/bundles/bundle.tracing.replay.feedback.min.js',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay)',
    path: 'packages/browser/build/bundles/bundle.tracing.replay.min.js',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing)',
    path: 'packages/browser/build/bundles/bundle.tracing.min.js',
    gzip: true,
    limit: '40 KB',
  },
  {
    name: 'CDN Bundle',
    path: 'packages/browser/build/bundles/bundle.min.js',
    gzip: true,
    limit: '30 KB',
  },

  // browser CDN bundles (non-gzipped)
  {
    name: 'CDN Bundle (incl. Tracing, Replay) - uncompressed',
    path: 'packages/browser/build/bundles/bundle.tracing.replay.min.js',
    gzip: false,
    brotli: false,
    limit: '260 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing) - uncompressed',
    path: 'packages/browser/build/bundles/bundle.tracing.min.js',
    gzip: false,
    brotli: false,
    limit: '120 KB',
  },
  {
    name: 'CDN Bundle - uncompressed',
    path: 'packages/browser/build/bundles/bundle.min.js',
    gzip: false,
    brotli: false,
    limit: '80 KB',
  },

  // React
  {
    name: '@sentry/react (incl. Tracing, Replay)',
    path: 'packages/react/build/esm/index.js',
    import: '{ init, browserTracingIntegration, replayIntegration }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/react',
    path: 'packages/react/build/esm/index.js',
    import: '{ init }',
    gzip: true,
    limit: '90 KB',
  },

  // Next.js
  // TODO: Re-enable these, when we figure out why they break...
  /*  {
    name: '@sentry/nextjs Client (incl. Tracing, Replay)',
    path: 'packages/nextjs/build/esm/client/index.js',
    import: '{ init, browserTracingIntegration, replayIntegration }',
    gzip: true,
    limit: '110 KB',
  },
  {
    name: '@sentry/nextjs Client',
    path: 'packages/nextjs/build/esm/client/index.js',
    import: '{ init }',
    gzip: true,
    limit: '57 KB',
  }, */
];
