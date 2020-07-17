module.exports = [
  {
    name: '@sentry/browser - CDN Bundle (gzipped)',
    path: 'packages/browser/build/bundle.min.js',
    gzip: true,
    limit: '18 KB',
  },
  {
    name: '@sentry/browser - Webpack',
    path: 'packages/browser/dist/index.js',
    import: '{ init }',
    limit: '18 KB',
  },
];
