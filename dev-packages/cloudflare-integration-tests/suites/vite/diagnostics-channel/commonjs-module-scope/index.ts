import * as Sentry from '@sentry/cloudflare';
import { compiled } from './graph.cjs';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
  }),
  {
    async fetch(_request, _env, _ctx) {
      await compiled.invoke({ messages: [{ role: 'user', content: 'Hello' }] });

      return new Response('ok');
    },
  },
);
