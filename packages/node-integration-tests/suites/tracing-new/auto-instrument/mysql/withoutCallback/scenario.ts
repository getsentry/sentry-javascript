import * as Sentry from '@sentry/node';
import mysql from 'mysql';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [...Sentry.autoDiscoverNodePerformanceMonitoringIntegrations()],
});

const connection = mysql.createConnection({
  user: 'root',
  password: 'docker',
});

connection.connect((err: unknown) => {
  if (err) {
    return;
  }
});

const transaction = Sentry.startTransaction({
  op: 'transaction',
  name: 'Test Transaction',
});

Sentry.configureScope(scope => {
  scope.setSpan(transaction);
});

const query = connection.query('SELECT 1 + 1 AS solution');
const query2 = connection.query('SELECT NOW()', ['1', '2']);

query.on('end', () => {
  transaction.setTag('result_done', 'yes');

  query2.on('end', () => {
    transaction.setTag('result_done2', 'yes');

    // Wait a bit to ensure the queries completed
    setTimeout(() => {
      transaction.finish();
    }, 500);
  });
});
