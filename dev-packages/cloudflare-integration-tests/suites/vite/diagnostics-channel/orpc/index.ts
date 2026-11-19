import { ORPCError, os } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

const router = {
  planet: {
    find: os.handler(() => ({ name: 'Earth' })),
    crash: os.handler(() => {
      throw new Error('Sentry Test Error');
    }),
    missing: os.handler(() => {
      throw new ORPCError('NOT_FOUND');
    }),
  },
};

// At module scope, as in most apps. The vite plugin hooks only per-request oRPC internals.
const handler = new RPCHandler(router);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
  }),
  {
    async fetch(request, _env, _ctx) {
      const { matched, response } = await handler.handle(request, { prefix: '/rpc' });
      return matched ? response : new Response('Not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
