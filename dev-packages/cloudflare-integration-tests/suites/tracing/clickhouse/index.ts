import { createClient } from '@clickhouse/client-web';

// The real web client runs in workerd, with its methods instrumented by the Sentry Vite plugin.
// Only the HTTP responses are mocked, so this needs neither a ClickHouse service nor credentials.
export default {
  async fetch() {
    const queries: string[] = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const query = url.searchParams.get('query') ?? String(init?.body);
      queries.push(query);
      if (query.includes('does_not_exist')) {
        return new Response('Code: 60. DB::Exception: Table tests.does_not_exist does not exist. (UNKNOWN_TABLE)', {
          status: 500,
        });
      }
      return new Response('{"name":"signup"}\n');
    };

    const client = createClient({
      url: 'http://clickhouse.internal:8123',
      database: 'tests',
      username: 'test',
      password: 'test',
      fetch: mockFetch,
    });

    try {
      const result = await client.query({
        query: "SELECT name FROM events WHERE name = 'signup'",
        format: 'JSONEachRow',
      });
      const rows = await result.json();
      await client.command({ query: 'INSERT INTO TABLE events FORMAT CSV\n1,private@example.com' });
      const { stream } = await client.exec({ query: 'SELECT count() FROM events FORMAT JSONEachRow' });
      await stream.cancel();
      await client.insert({ table: 'events', values: [{ id: 1, name: 'signup' }], format: 'JSONEachRow' });
      // An empty insert makes no HTTP request and must not create a span.
      await client.insert({ table: 'events', values: [], format: 'JSONEachRow' });

      let failures = 0;
      for (const call of [
        () => client.query({ query: 'SELECT * FROM does_not_exist' }),
        () => client.command({ query: 'DROP TABLE does_not_exist' }),
        () => client.exec({ query: 'SELECT * FROM does_not_exist FORMAT JSONEachRow' }),
        () => client.insert({ table: 'does_not_exist', values: [{ id: 1 }], format: 'JSONEachRow' }),
      ]) {
        await call().catch(() => {
          failures++;
        });
      }

      return Response.json({ rows, requests: queries.length, failures });
    } finally {
      await client.close();
    }
  },
} satisfies ExportedHandler;
