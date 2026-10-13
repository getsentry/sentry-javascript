import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  SELF: Fetcher;
  CONNECT_DO: DurableObjectNamespace<ConnectDurableObject>;
}

export class ConnectDurableObject extends DurableObject<Env> {}

function tryConnect(connect: () => Socket): string {
  try {
    const socket = connect();
    socket.opened.catch(() => {});
    socket.closed.catch(() => {});
    return 'ok';
  } catch (error) {
    return (error as Error).message;
  }
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(request, env) {
      const url = new URL(request.url);

      if (url.pathname === '/connect') {
        const stub = env.CONNECT_DO.get(env.CONNECT_DO.idFromName('connect'));

        return Response.json({
          durableObject: tryConnect(() => stub.connect('127.0.0.1:9')),
          service: tryConnect(() => env.SELF.connect('127.0.0.1:9')),
        });
      }

      return new Response('not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
