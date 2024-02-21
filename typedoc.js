module.exports = {
  out: './docs/',
  readme: 'README.md',
  name: 'Sentry JavaScript SDKs',
  includes: './',
  exclude: [
    '**/test/**/*',
    '**/*.js',
    '**/cjs/**/*',
    '**/esm/**/*',
    '**/build/**/*',
    '**/packages/typescript/**/*',
    '**/packages/eslint-*/**/*',
  ],
  mode: 'modules',
  excludeExternals: true,
  includeDeclarations: true,
  includeVersion: true,
  excludeNotExported: true,
  excludePrivate: true,
  // Turned on as @sentry/angular uses decorators
  experimentalDecorators: true,
  // Turned on for @sentry/react
  jsx: 'react',
  'external-modulemap': '.*/packages/([^/]+)/.*',
};
