import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

const myWorker = {
  async fetch(request: Request) {
    return new Response('Hello from another worker!');
  },
};

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  myWorker,
);
