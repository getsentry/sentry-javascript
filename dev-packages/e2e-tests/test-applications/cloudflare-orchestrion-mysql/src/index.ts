import * as Sentry from '@sentry/cloudflare';
// @ts-ignore -- `mysql` ships no type declarations; only needed at runtime.
import mysql from 'mysql';

// The `@sentry/cloudflare/vite` plugin's orchestrion transform injects the
// `orchestrion:mysql:query` diagnostics channel into the bundled `mysql`
// package at build time. The SDK detects the injection and subscribes to the
// channel, so the queries below produce `db` spans with no OTel require-hook —
// which wouldn't work in workerd anyway.

interface Connection {
  query(sql: string, cb: (err: unknown, results?: unknown) => void): void;
  end(cb?: (err: unknown) => void): void;
  on(event: string, cb: (err: unknown) => void): void;
}

interface MysqlModule {
  createConnection(opts: { host: string; port: number; user: string; password: string }): Connection;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.E2E_TEST_DSN,
    environment: 'qa',
    tunnel: 'http://localhost:3031/',
    tracesSampleRate: 1.0,
    transportOptions: {
      bufferSize: 1000,
    },
  }),
  {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);

      // Runs two queries, the second NESTED inside the first's callback. mysql
      // dispatches that callback from its socket data handler (a fresh async
      // context), so the nested query's span only lands on this request's
      // http.server transaction if the channel subscriber restored the parent
      // span across that async boundary.
      if (url.pathname === '/test-mysql') {
        // The connection is created inside the handler: workerd forbids I/O in
        // global scope, and mysql opens its socket lazily on the first query.
        const connection = (mysql as MysqlModule).createConnection({
          host: '127.0.0.1',
          port: 3306,
          user: 'root',
          password: 'password',
        });

        // Swallow connection-level errors so a socket hiccup doesn't become an
        // uncaught exception that fails the request unrelated to the spans.
        connection.on('error', () => {
          // no-op
        });

        await new Promise<void>((resolve, reject) => {
          connection.query('SELECT 1 + 1 AS solution', (err: unknown) => {
            if (err) return reject(err);
            connection.query('SELECT NOW()', (err2: unknown) => {
              connection.end();
              if (err2) return reject(err2);
              resolve();
            });
          });
        });

        return Response.json({ status: 'ok' });
      }

      return new Response('Not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
