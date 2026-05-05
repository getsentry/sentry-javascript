import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
  DB: D1Database;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(request, env, _ctx) {
      const url = new URL(request.url);
      const db = Sentry.instrumentD1WithSentry(env.DB);

      if (url.pathname === '/init') {
        await db.exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)');
        await db.prepare('INSERT INTO users (name) VALUES (?)').bind('Alice').run();
        return new Response('Initialized');
      }

      if (url.pathname === '/query') {
        const result = await db.prepare('SELECT * FROM users WHERE name = ?').bind('Alice').first();
        return Response.json(result);
      }

      return new Response('OK');
    },
  } satisfies ExportedHandler<Env>,
);
