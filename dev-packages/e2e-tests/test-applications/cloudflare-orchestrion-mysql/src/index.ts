// @ts-ignore -- `mysql` ships no type declarations; only needed at runtime.
import mysql from 'mysql';

// Plain worker — no manual `Sentry.withSentry` wrapping. The
// `@sentry/cloudflare/vite` plugin wraps the entry at build time using the
// options from `instrument.server.ts`, and its orchestrion transform injects
// the `orchestrion:mysql:query` diagnostics channel into the bundled `mysql`
// package. The Cloudflare SDK subscribes to that channel (once it detects the
// bundler injection), so the queries below produce `db` spans with no OTel
// require-hook — which wouldn't work in workerd anyway.

interface Connection {
  query(sql: string, cb: (err: unknown, results?: unknown) => void): void;
  end(cb?: (err: unknown) => void): void;
  on(event: string, cb: (err: unknown) => void): void;
}

interface MysqlModule {
  createConnection(opts: { host: string; port: number; user: string; password: string }): Connection;
}

export default {
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
} satisfies ExportedHandler<Env>;
