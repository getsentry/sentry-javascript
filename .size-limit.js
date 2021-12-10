module.exports = [
  {
    name: '@sentry/browser - CDN Bundle (gzipped)',
    path: 'packages/browser/build/bundle.min.js',
    gzip: true,
    limit: '100 KB',
  },
  {
    name: '@sentry/browser - Webpack',
    path: 'packages/browser/esm/index.js',
    import: '{ init }',
    limit: '100 KB',
  },
  {
    name: '@sentry/react - Webpack',
    path: 'packages/react/esm/index.js',
    import: '{ init }',
    limit: '100 KB',
  },
  {
    name: '@sentry/nextjs Client - Webpack',
    path: 'packages/nextjs/esm/index.client.js',
    import: '{ init }',
    limit: '100 KB',
  },
  {
    name: '@sentry/browser + @sentry/tracing - CDN Bundle (gzipped)',
    path: 'packages/tracing/build/bundle.tracing.min.js',
    gzip: true,
    limit: '100 KB',
  },
];
