// `@sentry/deno/import` MUST be the very first import: it registers the
// orchestrion runtime hook, which transforms `mysql` (imported dynamically
// below) to publish the `orchestrion:mysql:query` diagnostics channel.
// In Deno 2.8.0–2.8.2 the hook only works as the first import in the entry graph.
import '@sentry/deno/import';
import * as Sentry from '@sentry/deno';

Sentry.init({
  environment: 'qa',
  dsn: Deno.env.get('E2E_TEST_DSN'),
  debug: !!Deno.env.get('DEBUG'),
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1,
});

// Dynamic import AFTER init so the orchestrion hook (registered above) is in
// place to transform `mysql/lib/Connection.js`'s `query`, and so
// `denoMysqlIntegration` (wired by `init()`) is already subscribed.
const { default: mysql } = await import('mysql');

const connection = mysql.createConnection({
  host: Deno.env.get('MYSQL_HOST') ?? '127.0.0.1',
  port: Number(Deno.env.get('MYSQL_PORT') ?? 3306),
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

const port = 3030;

Deno.serve({ port, hostname: '0.0.0.0' }, async (req: Request) => {
  const url = new URL(req.url);

  // Runs two queries, the second NESTED inside the first's callback. mysql
  // dispatches that callback from its socket data handler (a fresh async
  // context), so the nested query's span only lands on this request's
  // http.server transaction if `denoMysqlIntegration`'s AsyncLocalStorage
  // context strategy restored the parent across the async boundary.
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
});
