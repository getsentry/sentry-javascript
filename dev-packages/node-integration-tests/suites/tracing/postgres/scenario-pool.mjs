import * as Sentry from '@sentry/node';
import pg from 'pg';

const { Pool } = pg;

// The connection string carries credentials so we can assert they are masked
// out of the `db.connection_string` span attribute.
const pool = new Pool({ connectionString: 'postgresql://test:test@localhost:5494/tests' });

async function run() {
  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async () => {
      try {
        // Callback-style query exercises the callback-patching path (the
        // promise-based scenarios never hit it).
        await new Promise((resolve, reject) => {
          pool.query('SELECT 1 AS foo', (err, res) => (err ? reject(err) : resolve(res)));
        });
      } finally {
        await pool.end();
      }
    },
  );
}

run();
