// Each target bundles the shared workload with one bundler and the Sentry plugin of one SDK into
// `dist/<name>/dist/<variant>`, the layout `assertBundlerInstrumentation` reads.
export const TARGETS = [
  { name: 'esbuild', bundler: 'esbuild', sdk: '@sentry/node', entry: 'entry.mjs' },
  { name: 'rollup', bundler: 'rollup', sdk: '@sentry/node', entry: 'entry.mjs' },
  { name: 'rolldown', bundler: 'rolldown', sdk: '@sentry/node', entry: 'entry.mjs' },
  { name: 'vite', bundler: 'vite', sdk: '@sentry/node', entry: 'entry.mjs' },
  { name: 'webpack', bundler: 'webpack', sdk: '@sentry/node', entry: 'entry.mjs' },
  {
    name: 'aws-serverless-esbuild',
    bundler: 'esbuild',
    sdk: '@sentry/aws-serverless',
    entry: 'entry-aws-serverless.mjs',
  },
];
