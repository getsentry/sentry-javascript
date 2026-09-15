import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

async function rejectAfter(ms: number, message: string): Promise<void> {
  await scheduler.wait(ms);
  throw new Error(message);
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
  }),
  {
    async fetch(request, _env, ctx) {
      const url = new URL(request.url);

      if (url.pathname === '/fire-and-forget') {
        void rejectAfter(0, 'Fire-and-forget rejection');
        await scheduler.wait(10);
        return new Response('ok');
      }

      if (url.pathname === '/after-response') {
        void rejectAfter(20, 'Rejection after response');
        ctx.waitUntil(scheduler.wait(50));
        return new Response('ok');
      }

      if (url.pathname === '/handled') {
        await rejectAfter(0, 'Handled rejection').catch(() => undefined);
        Sentry.captureMessage('Sentinel after handled rejection');
        return new Response('ok');
      }

      return new Response('not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
