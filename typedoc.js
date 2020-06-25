module.exports = {
  out: './docs/',
  readme: 'README.md',
  name: 'Sentry JavaScript SDKs',
  includes: './',
  exclude: [
    '**/test/**/*',
    '**/*.js',
    '**/dist/**/*',
    '**/esm/**/*',
    '**/build/**/*',
    '**/packages/typescript/**/*',
    '**/dangerfile.ts',
    // TODO: Don't exclude React
    '**/packages/react/**/*',
  ],
  mode: 'modules',
  excludeExternals: true,
  excludeNotExported: true,
  excludePrivate: true,
  'external-modulemap': '.*/packages/([^/]+)/.*',
};
