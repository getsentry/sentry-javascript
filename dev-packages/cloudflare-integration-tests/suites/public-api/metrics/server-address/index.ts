import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    release: '1.0.0',
    environment: 'test',
    serverName: 'mi-servidor.com',
  }),
  {
    async fetch(_request, _env, _ctx) {
      Sentry.metrics.count('test.counter', 1, { attributes: { endpoint: '/api/test' } });
      await Sentry.flush();
      return new Response('OK');
    },
  },
);
