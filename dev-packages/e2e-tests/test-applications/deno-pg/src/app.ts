// `@sentry/deno/import` MUST be the very first import: it registers the
// orchestrion runtime hook, which transforms `pg` (imported dynamically below)
// to publish the `orchestrion:pg:query` diagnostics channel.
// In Deno 2.8.0–2.8.2 the hook only works as the first import in the entry
// graph.
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
// place to transform `pg/lib/client.js`'s `query`, and so
// `denoPostgresIntegration` (wired by `init()`) is already subscribed.
const { default: pg } = await import('pg');

const client = new pg.Client({
  host: Deno.env.get('PGHOST') ?? '127.0.0.1',
  port: Number(Deno.env.get('PGPORT') ?? 5432),
  user: 'postgres',
  password: 'password',
  database: 'postgres',
});

// Swallow connection errors (e.g. the DB container going away at teardown) so
// they don't become an uncaught exception that crashes the process on
// shutdown.
client.on('error', (err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('pg client error', err);
});

client.connect((err: unknown) => {
  if (err) {
    // eslint-disable-next-line no-console
    console.error('pg connect error', err);
  }
});

const port = 3030;

Deno.serve({ port, hostname: '0.0.0.0' }, async (req: Request) => {
  const url = new URL(req.url);

  // Runs two queries, the second NESTED inside the first's callback. pg
  // dispatches that callback from its socket data handler (a fresh async
  // context), so the nested query's span only lands on this request's
  // http.server transaction if `denoPostgresIntegration`'s AsyncLocalStorage
  // context strategy restored the parent across the async boundary.
  if (url.pathname === '/test-pg') {
    await new Promise<void>((resolve, reject) => {
      client.query('SELECT 1 + 1 AS solution', (err: unknown) => {
        if (err) return reject(err);
        client.query('SELECT NOW()', (err2: unknown) => {
          if (err2) return reject(err2);
          resolve();
        });
      });
    });
    return Response.json({ status: 'ok' });
  }

  return new Response('Not found', { status: 404 });
});
