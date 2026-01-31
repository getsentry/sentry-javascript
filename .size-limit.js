const builtinModules = require('module').builtinModules;
const nodePrefixedBuiltinModules = builtinModules.map(m => `node:${m}`);

module.exports = [
  // Browser SDK (ESM)
  {
    name: '@sentry/browser',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init'),
    gzip: true,
    limit: '25.5 KB',
  },
  {
    name: '@sentry/browser - with treeshaking flags',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init'),
    gzip: true,
    limit: '24.1 KB',
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

      config.optimization.minimize = true;

      return config;
    },
  },
  {
    name: '@sentry/browser (incl. Tracing)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'browserTracingIntegration'),
    gzip: true,
    limit: '43 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Profiling)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'browserTracingIntegration', 'browserProfilingIntegration'),
    gzip: true,
    limit: '48 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'browserTracingIntegration', 'replayIntegration'),
    gzip: true,
    limit: '82 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay) - with treeshaking flags',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'browserTracingIntegration', 'replayIntegration'),
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

      config.optimization.minimize = true;

      return config;
    },
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay with Canvas)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'browserTracingIntegration', 'replayIntegration', 'replayCanvasIntegration'),
    gzip: true,
    limit: '86 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay, Feedback)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'browserTracingIntegration', 'replayIntegration', 'feedbackIntegration'),
    gzip: true,
    limit: '98 KB',
  },
  {
    name: '@sentry/browser (incl. Feedback)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'feedbackIntegration'),
    gzip: true,
    limit: '43 KB',
  },
  {
    name: '@sentry/browser (incl. sendFeedback)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'sendFeedback'),
    gzip: true,
    limit: '31 KB',
  },
  {
    name: '@sentry/browser (incl. FeedbackAsync)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'feedbackAsyncIntegration'),
    gzip: true,
    limit: '36 KB',
  },
  {
    name: '@sentry/browser (incl. Metrics)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'metrics'),
    gzip: true,
    limit: '27 KB',
  },
  {
    name: '@sentry/browser (incl. Logs)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'logger'),
    gzip: true,
    limit: '27 KB',
  },
  {
    name: '@sentry/browser (incl. Metrics & Logs)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'metrics', 'logger'),
    gzip: true,
    limit: '28 KB',
  },
  // React SDK (ESM)
  {
    name: '@sentry/react',
    path: 'packages/react/build/esm/index.js',
    import: createImport('init', 'ErrorBoundary'),
    ignore: ['react/jsx-runtime'],
    gzip: true,
    limit: '28 KB',
  },
  {
    name: '@sentry/react (incl. Tracing)',
    path: 'packages/react/build/esm/index.js',
    import: createImport('init', 'ErrorBoundary', 'reactRouterV6BrowserTracingIntegration'),
    ignore: ['react/jsx-runtime'],
    gzip: true,
    limit: '44.5 KB',
  },
  // Vue SDK (ESM)
  {
    name: '@sentry/vue',
    path: 'packages/vue/build/esm/index.js',
    import: createImport('init'),
    gzip: true,
    limit: '30 KB',
  },
  {
    name: '@sentry/vue (incl. Tracing)',
    path: 'packages/vue/build/esm/index.js',
    import: createImport('init', 'browserTracingIntegration'),
    gzip: true,
    limit: '44.1 KB',
  },
  // Svelte SDK (ESM)
  {
    name: '@sentry/svelte',
    path: 'packages/svelte/build/esm/index.js',
    import: createImport('init'),
    gzip: true,
    limit: '25.5 KB',
  },
  // Browser CDN bundles
  {
    name: 'CDN Bundle',
    path: createCDNPath('bundle.min.js'),
    gzip: true,
    limit: '28 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing)',
    path: createCDNPath('bundle.tracing.min.js'),
    gzip: true,
    limit: '44 KB',
  },
  {
    name: 'CDN Bundle (incl. Logs, Metrics)',
    path: createCDNPath('bundle.logs.metrics.min.js'),
    gzip: true,
    limit: '29 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing, Logs, Metrics)',
    path: createCDNPath('bundle.tracing.logs.metrics.min.js'),
    gzip: true,
    limit: '44 KB',
  },
  {
    name: 'CDN Bundle (incl. Replay, Logs, Metrics)',
    path: createCDNPath('bundle.replay.logs.metrics.min.js'),
    gzip: true,
    limit: '69 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay)',
    path: createCDNPath('bundle.tracing.replay.min.js'),
    gzip: true,
    limit: '80 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay, Logs, Metrics)',
    path: createCDNPath('bundle.tracing.replay.logs.metrics.min.js'),
    gzip: true,
    limit: '81 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay, Feedback)',
    path: createCDNPath('bundle.tracing.replay.feedback.min.js'),
    gzip: true,
    limit: '86 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay, Feedback, Logs, Metrics)',
    path: createCDNPath('bundle.tracing.replay.feedback.logs.metrics.min.js'),
    gzip: true,
    limit: '87 KB',
  },
  // browser CDN bundles (non-gzipped)
  {
    name: 'CDN Bundle - uncompressed',
    path: createCDNPath('bundle.min.js'),
    gzip: false,
    brotli: false,
    limit: '82 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing) - uncompressed',
    path: createCDNPath('bundle.tracing.min.js'),
    gzip: false,
    brotli: false,
    limit: '128 KB',
  },
  {
    name: 'CDN Bundle (incl. Logs, Metrics) - uncompressed',
    path: createCDNPath('bundle.logs.metrics.min.js'),
    gzip: false,
    brotli: false,
    limit: '86 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing, Logs, Metrics) - uncompressed',
    path: createCDNPath('bundle.tracing.logs.metrics.min.js'),
    gzip: false,
    brotli: false,
    limit: '131 KB',
  },
  {
    name: 'CDN Bundle (incl. Replay, Logs, Metrics) - uncompressed',
    path: createCDNPath('bundle.replay.logs.metrics.min.js'),
    gzip: false,
    brotli: false,
    limit: '209 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay) - uncompressed',
    path: createCDNPath('bundle.tracing.replay.min.js'),
    gzip: false,
    brotli: false,
    limit: '245 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay, Logs, Metrics) - uncompressed',
    path: createCDNPath('bundle.tracing.replay.logs.metrics.min.js'),
    gzip: false,
    brotli: false,
    limit: '250 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay, Feedback) - uncompressed',
    path: createCDNPath('bundle.tracing.replay.feedback.min.js'),
    gzip: false,
    brotli: false,
    limit: '264 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay, Feedback, Logs, Metrics) - uncompressed',
    path: createCDNPath('bundle.tracing.replay.feedback.logs.metrics.min.js'),
    gzip: false,
    brotli: false,
    limit: '264 KB',
  },
  // Next.js SDK (ESM)
  {
    name: '@sentry/nextjs (client)',
    path: 'packages/nextjs/build/esm/client/index.js',
    import: createImport('init'),
    ignore: ['next/router', 'next/constants'],
    gzip: true,
    limit: '47 KB',
  },
  // SvelteKit SDK (ESM)
  {
    name: '@sentry/sveltekit (client)',
    path: 'packages/sveltekit/build/esm/client/index.js',
    import: createImport('init'),
    ignore: ['$app/stores'],
    gzip: true,
    limit: '43 KB',
  },
  // Node-Core SDK (ESM)
  {
    name: '@sentry/node-core',
    path: 'packages/node-core/build/esm/index.js',
    import: createImport('init'),
    ignore: [...builtinModules, ...nodePrefixedBuiltinModules],
    gzip: true,
    limit: '53 KB',
  },
  // Node SDK (ESM)
  {
    name: '@sentry/node',
    path: 'packages/node/build/esm/index.js',
    import: createImport('init'),
    ignore: [...builtinModules, ...nodePrefixedBuiltinModules],
    gzip: true,
    limit: '167 KB',
  },
  {
    name: '@sentry/node - without tracing',
    path: 'packages/node/build/esm/index.js',
    import: createImport('initWithoutDefaultIntegrations', 'getDefaultIntegrationsWithoutPerformance'),
    gzip: true,
    limit: '95 KB',
    ignore: [...builtinModules, ...nodePrefixedBuiltinModules],
    modifyWebpackConfig: function (config) {
      const webpack = require('webpack');

      config.plugins.push(
        new webpack.DefinePlugin({
          __SENTRY_TRACING__: false,
        }),
      );

      config.optimization.minimize = true;

      return config;
    },
  },
  // AWS SDK (ESM)
  {
    name: '@sentry/aws-serverless',
    path: 'packages/aws-serverless/build/npm/esm/index.js',
    import: createImport('init'),
    ignore: [...builtinModules, ...nodePrefixedBuiltinModules],
    gzip: true,
    limit: '111 KB',
  },
];

function createImport(...args) {
  return `{ ${args.join(', ')} }`;
}

function createCDNPath(name) {
  return `packages/browser/build/bundles/${name}`;
}
