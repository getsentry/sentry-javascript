import mysql from 'mysql';
import { defineEventHandler } from '#imports';

import * as Sentry from '@sentry/nuxt';

// Runtime hook that injects diagnostics-channel calls into externalized deps (e.g. `mysql`),
// which OTel can't instrument under ESM/`--import`. Must run before `Sentry.init()`.
Sentry.experimentalUseDiagnosticsChannelInjection();

Sentry.init({
  debug: true,
  dsn: 'https://e88b32b2db8229c9b7b693337bd60a12@o447951.ingest.us.sentry.io/4507486945738752',
  tracesSampleRate: 1.0, // Capture 100% of the transactions
  // tunnel: 'http://localhost:3031/', // proxy server
});

const connection = mysql.createConnection({
  user: 'root',
  password: 'docker',
});

export default defineEventHandler(() => {
  return new Promise(resolve => {
    connection.query('SELECT 1 + 1 AS solution', () => {
      connection.query('SELECT NOW()', ['1', '2'], () => {
        resolve({ status: 'ok' });
      });
    });
  });
});
