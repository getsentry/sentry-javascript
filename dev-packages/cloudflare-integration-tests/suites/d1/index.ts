import type { D1Database } from '@cloudflare/workers-types';
import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
  DB: D1Database;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
  }),
  {
    async fetch(request, env, _ctx) {
      const url = new URL(request.url);

      if (url.pathname === '/prepare') {
        await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(1).all();
        return new Response('ok');
      }

      if (url.pathname === '/double-instrument') {
        const prepareBeforeManual = env.DB.prepare;
        const db = Sentry.instrumentD1WithSentry(env.DB);
        const prepareAfterManual = db.prepare;

        await db.prepare('SELECT * FROM users WHERE id = ?').bind(1).all();

        const isSameRef = prepareBeforeManual === prepareAfterManual ? 'true' : 'false';
        return new Response(isSameRef);
      }

      return new Response('not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
