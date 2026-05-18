import * as Sentry from '@sentry/node';
import { _experimentalSetupOrchestrion } from '@sentry/node';
import mysql from 'mysql';

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
