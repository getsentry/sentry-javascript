const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

// `test.ts` writes these packages in the folders where the isolated layouts of pnpm and Bun keep them
require('./node_modules/.pnpm/pnpm-isolated-package@1.2.3/node_modules/pnpm-isolated-package');
require('./node_modules/.bun/bun-isolated-package@4.5.6/node_modules/bun-isolated-package');

Sentry.captureException(new Error('error_1'));
