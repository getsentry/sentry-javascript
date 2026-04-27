module.exports = [
  {
    name: '@sentry/browser',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    gzip: true,
    limit: '27 KB',
  },
  {
    name: '@sentry/browser - with treeshaking flags',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    gzip: true,
    limit: '25 KB',
  },
  {
    name: 'CDN Bundle (incl. Tracing)',
    path: 'packages/browser/build/bundles/bundle.tracing.min.js',
    gzip: true,
    limit: '46.5 KB',
  },
  {
    name: '@sentry/cloudflare (withSentry)',
    path: 'packages/cloudflare/build/esm/index.js',
    gzip: false,
    brotli: false,
    limit: '420 KiB',
  },
];
