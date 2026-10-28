import * as Sentry from '@sentry/node';
import mysql from 'mysql';

const connection = mysql.createConnection({
  port: Number(process.env.MYSQL_PORT),
  user: 'root',
  password: 'docker',
});

function query(sql) {
  return new Promise((resolve, reject) => {
    connection.query(sql, err => (err ? reject(err) : resolve()));
  });
}

function streamQuery(sql) {
  return new Promise((resolve, reject) => {
    connection.query(sql).on('error', reject).on('end', resolve);
  });
}

async function run() {
  await query('SELECT 1 AS before_callback');
  await streamQuery('SELECT 1 AS before_stream');

  const parent = Sentry.startInactiveSpan({ name: 'parent operation' });
  await Sentry.withActiveSpan(parent, async () => {
    await query('SELECT 2 AS inside_callback');
    await streamQuery('SELECT 2 AS inside_stream');
  });

  await query('SELECT 3 AS after_callback');
  await streamQuery('SELECT 3 AS after_stream');
  await new Promise((resolve, reject) => {
    connection.end(err => (err ? reject(err) : resolve()));
  });

  // Flush every query before the parent signals that span collection is complete.
  await Sentry.flush();
  parent.end();
  await Sentry.flush();
}

run();
