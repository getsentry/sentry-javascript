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
    name: '@sentry/browser (incl. Tracing)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'browserTracingIntegration'),
    gzip: true,
    limit: '34 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'browserTracingIntegration', 'replayIntegration'),
    gzip: true,
    limit: '70 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay) - with treeshaking flags',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'browserTracingIntegration', 'replayIntegration'),
    gzip: true,
    limit: '65 KB',
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
    name: '@sentry/browser (incl. Tracing, Replay with Canvas)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'browserTracingIntegration', 'replayIntegration', 'replayCanvasIntegration'),
    gzip: true,
    limit: '75 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay, Feedback)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'browserTracingIntegration', 'replayIntegration', 'feedbackIntegration'),
    gzip: true,
    limit: '83 KB',
  },
  {
    name: '@sentry/browser (incl. Feedback)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'feedbackIntegration'),
    gzip: true,
    limit: '37 KB',
  },
  {
    name: '@sentry/browser (incl. Feedback, Feedback Modal)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'feedbackIntegration', 'feedbackModalIntegration'),
    gzip: true,
    limit: '37 KB',
  },
  {
    name: '@sentry/browser (incl. Feedback, Feedback Modal, Feedback Screenshot)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'feedbackIntegration', 'feedbackModalIntegration', 'feedbackScreenshotIntegration'),
    gzip: true,
    limit: '40 KB',
  },
  {
    name: '@sentry/browser (incl. sendFeedback)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: createImport('init', 'sendFeedback'),
    gzip: true,
    limit: '30 KB',
  },
  // React SDK (ESM)
  {
    name: '@sentry/react',
    path: 'packages/react/build/esm/index.js',
    import: createImport('init', 'ErrorBoundary'),
    gzip: true,
    limit: '27 KB',
  },
  {
    name: '@sentry/react (incl. Tracing)',
    path: 'packages/react/build/esm/index.js',
    import: createImport('init', 'ErrorBoundary', 'reactRouterV6BrowserTracingIntegration'),
    gzip: true,
    limit: '37 KB',
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
    limit: '36 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay)',
    path: createCDNPath('bundle.tracing.replay.min.js'),
    gzip: true,
    limit: '70 KB',
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
    limit: '105 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay) - uncompressed',
    path: createCDNPath('bundle.tracing.replay.min.js'),
    gzip: false,
    brotli: false,
    limit: '220 KB',
  },
  // Next.js SDK (ESM)
  {
    name: '@sentry/nextjs (client)',
    path: 'packages/nextjs/build/esm/client/index.js',
    import: createImport('init'),
    ignore: ['next/router', 'next/constants'],
    gzip: true,
    limit: '37 KB',
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
    ignore: [
      'node:http',
      'node:https',
      'node:diagnostics_channel',
      'async_hooks',
      'child_process',
      'fs',
      'os',
      'path',
      'inspector',
      'worker_threads',
      'http',
      'stream',
      'zlib',
      'net',
      'tls',
    ],
    gzip: true,
    limit: '160 KB',
  },
];

function createImport(...args) {
  return `{ ${args.join(', ')} }`;
}

function createCDNPath(name) {
  return `packages/browser/build/bundles/${name}`;
}
