import * as Sentry from '@sentry/bun';

// @ts-ignore -- `mysql` ships no type declarations; only needed at runtime.
import mysql from 'mysql';

Sentry.init({
  environment: 'qa',
  dsn: process.env.E2E_TEST_DSN,
  debug: !!process.env.DEBUG,
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1,
});

interface Connection {
  query(sql: string, cb: (err: unknown) => void): void;
  connect(cb: (err: unknown) => void): void;
  on(event: string, cb: (err: unknown) => void): void;
}
interface MysqlModule {
  createConnection(opts: { host: string; port: number; user: string; password: string }): Connection;
}

// `mysql` was transformed at build time (by `@sentry/bun/plugin`) to publish
// the `orchestrion:mysql:query` channel. The Bun SDK subscribes to it, so the
// queries below produce db spans without any OTel require-hook.
const connection = (mysql as MysqlModule).createConnection({
  host: process.env.MYSQL_HOST ?? '127.0.0.1',
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: 'root',
  password: 'password',
});

// Swallow connection errors (e.g. the DB container going away at teardown) so
// they don't become an uncaught exception that crashes the process on shutdown.
connection.on('error', (err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('mysql connection error', err);
});

connection.connect((err: unknown) => {
  if (err) {
    // eslint-disable-next-line no-console
    console.error('mysql connect error', err);
  }
});

Bun.serve({
  port: 3030,
  hostname: '0.0.0.0',
  async fetch(req: Request) {
    const url = new URL(req.url);

    // Runs two queries, the second NESTED inside the first's callback. mysql
    // dispatches that callback from its socket data handler (a fresh async
    // context), so the nested query's span only lands on this request's
    // http.server transaction if the channel subscriber restored the parent
    // across the async boundary.
    if (url.pathname === '/test-mysql') {
      await new Promise<void>((resolve, reject) => {
        connection.query('SELECT 1 + 1 AS solution', (err: unknown) => {
          if (err) return reject(err);
          connection.query('SELECT NOW()', (err2: unknown) => {
            if (err2) return reject(err2);
            resolve();
          });
        });
      });
      return Response.json({ status: 'ok' });
    }

    return new Response('Not found', { status: 404 });
  },
});
