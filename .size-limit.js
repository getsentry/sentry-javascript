const builtinModules = require('module').builtinModules;
const nodePrefixedBuiltinModules = builtinModules.map(m => `node:${m}`);

module.exports = [
  // Browser SDK (ESM)
  {
    name: '@sentry/browser',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init'),
    gzip: true,
    limit: '24 KB',
  },
  {
    name: '@sentry/browser - with treeshaking flags',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init'),
    gzip: true,
    limit: '24 KB',
    modifyWebpackConfig: function (config) {
      const webpack = require('webpack');
      const TerserPlugin = require('terser-webpack-plugin');

      config.plugins.push(
        new webpack.DefinePlugin({
          __SENTRY_DEBUG__: false,
          __RRWEB_EXCLUDE_SHADOW_DOM__: true,
          __RRWEB_EXCLUDE_IFRAME__: true,
          __SENTRY_EXCLUDE_REPLAY_WORKER__: true,
        }),
      );

      config.optimization.minimize = true;
      config.optimization.minimizer = [new TerserPlugin()];

      return config;
    },
  },
  {
    name: '@sentry/browser (incl. Tracing)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'browserTracingIntegration'),
    gzip: true,
    limit: '36 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'browserTracingIntegration', 'replayIntegration'),
    gzip: true,
    limit: '75 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay) - with treeshaking flags',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'browserTracingIntegration', 'replayIntegration'),
    gzip: true,
    limit: '68 KB',
    modifyWebpackConfig: function (config) {
      const webpack = require('webpack');
      const TerserPlugin = require('terser-webpack-plugin');

      config.plugins.push(
        new webpack.DefinePlugin({
          __SENTRY_DEBUG__: false,
          __RRWEB_EXCLUDE_SHADOW_DOM__: true,
          __RRWEB_EXCLUDE_IFRAME__: true,
          __SENTRY_EXCLUDE_REPLAY_WORKER__: true,
        }),
      );

      config.optimization.minimize = true;
      config.optimization.minimizer = [new TerserPlugin()];

      return config;
    },
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay with Canvas)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'browserTracingIntegration', 'replayIntegration', 'replayCanvasIntegration'),
    gzip: true,
    limit: '78.1 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay, Feedback)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'browserTracingIntegration', 'replayIntegration', 'feedbackIntegration'),
    gzip: true,
    limit: '95 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay, Feedback, metrics)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'browserTracingIntegration', 'replayIntegration', 'feedbackIntegration', 'metrics'),
    gzip: true,
    limit: '100 KB',
  },
  {
    name: '@sentry/browser (incl. metrics)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'metrics'),
    gzip: true,
    limit: '30 KB',
  },
  {
    name: '@sentry/browser (incl. Feedback)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'feedbackIntegration'),
    gzip: true,
    limit: '41 KB',
  },
  {
    name: '@sentry/browser (incl. sendFeedback)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'sendFeedback'),
    gzip: true,
    limit: '29 KB',
  },
  {
    name: '@sentry/browser (incl. FeedbackAsync)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'feedbackAsyncIntegration'),
    gzip: true,
    limit: '33 KB',
  },
  // React SDK (ESM)
  {
    name: '@sentry/react',
    path: 'packages/react/build/esm/index.js',
    import: createImport('init', 'ErrorBoundary'),
    ignore: ['react/jsx-runtime'],
    gzip: true,
    limit: '27 KB',
  },
  {
    name: '@sentry/react (incl. Tracing)',
    path: 'packages/react/build/esm/index.js',
    import: createImport('init', 'ErrorBoundary', 'reactRouterV6BrowserTracingIntegration'),
    ignore: ['react/jsx-runtime'],
    gzip: true,
    limit: '39.05 KB',
  },
  // Vue SDK (ESM)
  {
    name: '@sentry/vue',
    path: 'packages/vue/build/esm/index.js',
    import: createImport('init'),
    gzip: true,
    limit: '28 KB',
  },
  {
    name: '@sentry/vue (incl. Tracing)',
    path: 'packages/vue/build/esm/index.js',
    import: createImport('init', 'browserTracingIntegration'),
    gzip: true,
    limit: '38 KB',
  },
  // Svelte SDK (ESM)
  {
    name: '@sentry/svelte',
    path: 'packages/svelte/build/esm/index.js',
    import: createImport('init'),
    gzip: true,
    limit: '24 KB',
  },
  // Browser CDN bundles
  {
    name: 'CDN Bundle',
    path: createCDNPath('bundle.min.js'),
    gzip: true,
    limit: '26 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing)',
    path: createCDNPath('bundle.tracing.min.js'),
    gzip: true,
    limit: '38 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay)',
    path: createCDNPath('bundle.tracing.replay.min.js'),
    gzip: true,
    limit: '74 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay, Feedback)',
    path: createCDNPath('bundle.tracing.replay.feedback.min.js'),
    gzip: true,
    limit: '86 KB',
  },
  // browser CDN bundles (non-gzipped)
  {
    name: 'CDN Bundle - uncompressed',
    path: createCDNPath('bundle.min.js'),
    gzip: false,
    brotli: false,
    limit: '80 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing) - uncompressed',
    path: createCDNPath('bundle.tracing.min.js'),
    gzip: false,
    brotli: false,
    limit: '113 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay) - uncompressed',
    path: createCDNPath('bundle.tracing.replay.min.js'),
    gzip: false,
    brotli: false,
    limit: '230 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay, Feedback) - uncompressed',
    path: createCDNPath('bundle.tracing.replay.feedback.min.js'),
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
    limit: '39 KB',
  },
  // SvelteKit SDK (ESM)
  {
    name: '@sentry/sveltekit (client)',
    path: 'packages/sveltekit/build/esm/client/index.js',
    import: createImport('init'),
    ignore: ['$app/stores'],
    gzip: true,
    limit: '37 KB',
  },
  // Node SDK (ESM)
  {
    name: '@sentry/node',
    path: 'packages/node/build/esm/index.js',
    import: createImport('init'),
    ignore: [...builtinModules, ...nodePrefixedBuiltinModules],
    gzip: true,
    limit: '140 KB',
  },
  {
    name: '@sentry/node - without tracing',
    path: 'packages/node/build/esm/index.js',
    import: createImport('initWithoutDefaultIntegrations', 'getDefaultIntegrationsWithoutPerformance'),
    gzip: true,
    limit: '110 KB',
    ignore: [...builtinModules, ...nodePrefixedBuiltinModules],
    modifyWebpackConfig: function (config) {
      const webpack = require('webpack');
      const TerserPlugin = require('terser-webpack-plugin');

      config.plugins.push(
        new webpack.DefinePlugin({
          __SENTRY_TRACING__: false,
        }),
      );

      config.optimization.minimize = true;
      config.optimization.minimizer = [new TerserPlugin()];

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
    limit: '130 KB',
  },
];

function createImport(...args) {
  return `{ ${args.join(', ')} }`;
}

function createCDNPath(name) {
  return `packages/browser/build/bundles/${name}`;
}
