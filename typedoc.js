module.exports = {
  out: './docs/',
  readme: 'README.md',
  name: 'Sentry JavaScript SDKs',
  includes: './',
  exclude: [
    '**/test/**/*',
    '**/tests/**/*',
    '**/*.js',
    '**/dist/**/*',
    '**/esm/**/*',
    '**/build/**/*',
    '**/node_modules/**/*',
    '**/packages/typescript/**/*',
    '**/packages/eslint-*/**/*',

    // These are special cased because I don't know how to resolve type issues
    '**/packages/react/src/errorboundary.tsx',
    '**/packages/react/src/profiler.tsx',
    '**/packages/react/src/reactrouter.tsx',
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
