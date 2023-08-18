module.exports = [
  // Main browser webpack builds
  {
    name: '@sentry/browser (incl. Tracing, Replay) - Webpack (gzipped)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, Replay, BrowserTracing }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing) - Webpack (gzipped)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init, BrowserTracing }',
    gzip: true,
    limit: '35 KB',
  },
  {
    name: '@sentry/browser - Webpack (gzipped)',
    path: 'packages/browser/build/npm/esm/index.js',
    import: '{ init }',
    gzip: true,
    limit: '28 KB',
  },

  // Browser CDN bundles (ES6)
  {
    name: '@sentry/browser (incl. Tracing, Replay) - ES6 CDN Bundle (gzipped)',
    path: 'packages/browser/build/bundles/bundle.tracing.replay.min.js',
    gzip: true,
    limit: '80 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing) - ES6 CDN Bundle (gzipped)',
    path: 'packages/browser/build/bundles/bundle.tracing.min.js',
    gzip: true,
    limit: '35 KB',
  },
  {
    name: '@sentry/browser - ES6 CDN Bundle (gzipped)',
    path: 'packages/browser/build/bundles/bundle.min.js',
    gzip: true,
    limit: '28 KB',
  },

  // browser CDN bundles (ES6 + non-gzipped)
  {
    name: '@sentry/browser (incl. Tracing, Replay) - ES6 CDN Bundle (minified & uncompressed)',
    path: 'packages/browser/build/bundles/bundle.tracing.replay.min.js',
    gzip: false,
    limit: '260 KB',
  },
  {
    name: '@sentry/browser (incl. Tracing) - ES6 CDN Bundle (minified & uncompressed)',
    path: 'packages/browser/build/bundles/bundle.tracing.min.js',
    gzip: false,
    limit: '100 KB',
  },
  {
    name: '@sentry/browser - ES6 CDN Bundle (minified & uncompressed)',
    path: 'packages/browser/build/bundles/bundle.min.js',
    gzip: false,
    limit: '70 KB',
  },

  // Browser CDN bundles (ES5)
  // Replay is not supported in ES5 mode
  {
    name: '@sentry/browser (incl. Tracing) - ES5 CDN Bundle (gzipped)',
    path: 'packages/browser/build/bundles/bundle.tracing.es5.min.js',
    gzip: true,
    limit: '35 KB',
  },

  // React
  {
    name: '@sentry/react (incl. Tracing, Replay) - Webpack (gzipped)',
    path: 'packages/react/build/esm/index.js',
    import: '{ init, BrowserTracing, Replay }',
    gzip: true,
    limit: '90 KB',
  },
  {
    name: '@sentry/react - Webpack (gzipped)',
    path: 'packages/react/build/esm/index.js',
    import: '{ init }',
    gzip: true,
    limit: '30 KB',
  },

  // Next.js
  {
    name: '@sentry/nextjs Client (incl. Tracing, Replay) - Webpack (gzipped)',
    path: 'packages/nextjs/build/esm/client/index.js',
    import: '{ init, BrowserTracing, Replay }',
    gzip: true,
    limit: '110 KB',
  },
  {
    name: '@sentry/nextjs Client - Webpack (gzipped)',
    path: 'packages/nextjs/build/esm/client/index.js',
    import: '{ init }',
    gzip: true,
    limit: '57 KB',
  },
];
