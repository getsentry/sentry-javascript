import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';
import { _experimentalSetupOrchestrion } from '@sentry/node';
import mysql from 'mysql';

// EXPERIMENTAL — verifies the orchestrion runtime hook path for `mysql`.
//
// Pre-conditions set up by `instrument.mjs` (loaded via `--import` or `--require`
// before this file runs): orchestrion has rewritten `mysql/lib/Connection.js`
// so `Connection.prototype.query` publishes to `node:diagnostics_channel`.
// `_experimentalSetupOrchestrion()` below subscribes our channel-based mysql
// integration to those publications.

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  _experimentalUseOrchestrion: true,
});

_experimentalSetupOrchestrion(client);

// Stop the process from exiting before the transaction is sent.
setInterval(() => {}, 1000);

const connection = mysql.createConnection({
  user: 'root',
  password: 'docker',
});

Sentry.startSpanManual({ op: 'transaction', name: 'Test Transaction' }, span => {
  connection.query('SELECT 1 + 1 AS solution', () => {
    connection.query('SELECT NOW()', ['1', '2'], () => {
      span.end();
      connection.end();
    });
  });
});
