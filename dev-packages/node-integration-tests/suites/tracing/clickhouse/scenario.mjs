import * as Sentry from '@sentry/node';
import { waitForConnection } from '@sentry-internal/node-integration-tests';
import { createClient } from '@clickhouse/client';

const client = createClient({
  url: 'http://localhost:8123',
  username: 'test',
  password: 'test',
  database: 'tests',
});

async function run() {
  // `ping` isn't instrumented, so the probe adds no spans.
  await waitForConnection(async () => {
    const result = await client.ping();
    if (!result.success) {
      throw result.error;
    }
  });

  await Sentry.startSpan({ name: 'Test Span', op: 'test' }, async () => {
    try {
      await client.command({
        query: 'CREATE TABLE IF NOT EXISTS events (id UInt32, name String) ENGINE = MergeTree ORDER BY id',
      });

      await client.insert({ table: 'events', values: [{ id: 1, name: 'signup' }], format: 'JSONEachRow' });
      await client.command({ query: 'INSERT INTO events FORMAT CSV\n2,inline-sensitive@example.com' });

      const literal = await client.query({
        query: "SELECT name FROM events WHERE name = 'signup'",
        format: 'JSONEachRow',
      });
      await literal.json();

      const nestedComment = await client.query({
        query: 'SELECT 1 /* outer /* inner */ private@example.com */',
        format: 'JSONEachRow',
      });
      await nestedComment.json();

      const parameterized = await client.query({
        query: 'SELECT name FROM events WHERE id = {id:UInt32}',
        query_params: { id: 1 },
        format: 'JSONEachRow',
      });
      await parameterized.json();

      const { stream } = await client.exec({ query: 'SELECT count() FROM events FORMAT JSONEachRow' });
      for await (const _chunk of stream) {
        // drain the response so the socket is released
      }

      // Failed calls the caller handles: each should leave an errored span and no error event.
      await client.query({ query: 'SELECT * FROM does_not_exist' }).catch(() => {});
      await client.command({ query: 'DROP TABLE does_not_exist' }).catch(() => {});
      await client.exec({ query: 'SELECT * FROM does_not_exist FORMAT JSONEachRow' }).catch(() => {});
      await client.insert({ table: 'does_not_exist', values: [{ id: 1 }], format: 'JSONEachRow' }).catch(() => {});
    } finally {
      await client.command({ query: 'DROP TABLE IF EXISTS events' });
    }
  });

  await client.close();
}

run();
