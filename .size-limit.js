module.exports = [
  {
    name: '@sentry/browser - CDN Bundle (gzipped)',
    path: 'packages/browser/build/bundle.min.js',
    gzip: true,
    limit: '18 KB',
  },
  {
    name: '@sentry/browser - Webpack',
    path: 'packages/browser/esm/index.js',
    import: '{ init }',
    limit: '19 KB',
  },
  {
    name: '@sentry/react - Webpack',
    path: 'packages/react/esm/index.js',
    import: '{ init }',
    limit: '19 KB',
  },
  {
    name: '@sentry/browser + @sentry/tracing - CDN Bundle (gzipped)',
    path: 'packages/tracing/build/bundle.tracing.min.js',
    gzip: true,
    limit: '25 KB',
  },
];
