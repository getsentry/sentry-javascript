module.exports = [
  // Full bundles (ES6 & gzipped  + minified)
  {
    name: '@sentry/browser + @sentry/tracing + @sentry/replay - ES6 CDN Bundle (gzipped + minified)',
    path: 'packages/tracing/build/bundles/bundle.tracing.replay.min.js',
    gzip: true,
    limit: '80 KB',
  },
  {
    name: '@sentry/browser + @sentry/tracing - ES6 CDN Bundle (gzipped + minified)',
    path: 'packages/tracing/build/bundles/bundle.tracing.min.js',
    gzip: true,
    limit: '35 KB',
  },
  {
    name: '@sentry/browser - ES6 CDN Bundle (gzipped + minified)',
    path: 'packages/browser/build/bundles/bundle.min.js',
    gzip: true,
    limit: '28 KB',
  },
  {
    name: '@sentry/browser + @sentry/replay - ES6 CDN Bundle (gzipped + minified)',
    path: 'packages/browser/build/bundles/bundle.replay.min.js',
    gzip: true,
    limit: '80 KB',
  },

  // Webpack (gzip + minified)
  {
    name: '@sentry/browser - Webpack (gzipped + minified)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init }',
    gzip: true,
    limit: '30 KB',
  },
  {
    name: '@sentry/replay - Webpack (gzipped + minified)',
    path: 'packages/replay/build/npm/esm/index.js',
    import: '{ Replay }',
    gzip: true,
    limit: '48 KB',
    ignore: ['@sentry/browser', '@sentry/utils', '@sentry/core', '@sentry/types'],
  },
  {
    name: '@sentry/tracing - Webpack (gzipped + minified)',
    path: 'packages/tracing/build/npm/esm/index.js',
    gzip: true,
    limit: '48 KB',
    ignore: ['@sentry/utils', '@sentry/core', '@sentry/types'],
  },
  {
    name: '@sentry/react - Webpack (gzipped + minified)',
    path: 'packages/react/build/esm/index.js',
    import: '{ init }',
    gzip: true,
    limit: '30 KB',
  },
  {
    name: '@sentry/nextjs Client - Webpack (gzipped + minified)',
    path: 'packages/nextjs/build/esm/client/index.js',
    import: '{ init }',
    gzip: true,
    limit: '57 KB',
  },

  // ES5 bundles (gzipped + minified)
  {
    name: '@sentry/browser - ES5 CDN Bundle (gzipped + minified)',
    path: 'packages/browser/build/bundles/bundle.es5.min.js',
    gzip: true,
    limit: '30 KB',
  },
  {
    name: '@sentry/browser - ES5 CDN Bundle (minified)',
    path: 'packages/browser/build/bundles/bundle.es5.min.js',
    gzip: false,
    limit: '70 KB',
  },
  {
    name: '@sentry/browser + @sentry/tracing - ES5 CDN Bundle (gzipped + minified)',
    path: 'packages/tracing/build/bundles/bundle.tracing.es5.min.js',
    gzip: true,
    limit: '37 KB',
  },

  // Bundles (minified)
  {
    name: '@sentry/browser - ES6 CDN Bundle (minified)',
    path: 'packages/browser/build/bundles/bundle.min.js',
    gzip: false,
    limit: '65 KB',
  },
  {
    name: '@sentry/browser - Webpack (minified)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init }',
    gzip: false,
    limit: '76 KB',
  },
];
