const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

// `test.ts` writes these packages in the folders where the isolated layouts of pnpm and Bun keep them
require('pnpm-isolated-package');
require('@pnpm-isolated/scoped-package');
require('bun-isolated-package');
require('@bun-isolated/scoped-package');
// Another version of `pnpm-isolated-package`, loaded last as a dependency of the app would load it
require('./node_modules/.pnpm/pnpm-isolated-package@1.0.0/node_modules/pnpm-isolated-package');

Sentry.captureException(new Error('error_1'));
