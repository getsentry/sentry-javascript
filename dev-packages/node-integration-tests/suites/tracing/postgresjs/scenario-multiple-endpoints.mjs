import * as Sentry from '@sentry/node';
import postgres from 'postgres';
import { waitForConnection } from '@sentry-internal/node-integration-tests';

const TEST_DB_URL = 'postgres://test:test@localhost:5444/test_db';

// Both clients are created up front: with two known endpoints there is no single-endpoint fallback,
// so the connection attributes can only come from the connection each query actually runs on.
const testDbSql = postgres(TEST_DB_URL);
const postgresDbSql = postgres('postgres://test:test@localhost:5444/postgres');

async function run() {
  const probeSql = postgres(TEST_DB_URL, { max: 1 });
  await waitForConnection(() => probeSql`SELECT 1`);
  await probeSql.end();

  await Sentry.startSpan({ name: 'Test Transaction', op: 'transaction' }, async () => {
    try {
      await testDbSql`SELECT 1 AS test_db_new_connection`;
      await testDbSql`SELECT 1 AS test_db_open_connection`;
      await postgresDbSql`SELECT 1 AS postgres_db_new_connection`;
      await postgresDbSql`SELECT 1 AS postgres_db_open_connection`;
    } finally {
      await Promise.all([testDbSql.end(), postgresDbSql.end()]);
    }
  });
}

run();
