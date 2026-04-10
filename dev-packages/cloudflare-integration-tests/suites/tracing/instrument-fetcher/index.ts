import { instrumentDurableObjectWithSentry, withSentry } from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  ECHO_HEADERS_DO: DurableObjectNamespace;
}

class EchoHeadersDurableObjectBase extends DurableObject<Env> {
  async fetch(incoming: Request): Promise<Response> {
    return Response.json({
      sentryTrace: incoming.headers.get('sentry-trace'),
      baggage: incoming.headers.get('baggage'),
      authorization: incoming.headers.get('authorization'),
      xFromInit: incoming.headers.get('x-from-init'),
      xExtra: incoming.headers.get('x-extra'),
      xMergeProbe: incoming.headers.get('x-merge-probe'),
    });
  }
}

export const EchoHeadersDurableObject = instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  EchoHeadersDurableObjectBase,
);

export default withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(request, env) {
      const url = new URL(request.url);
      const id = env.ECHO_HEADERS_DO.idFromName('instrument-fetcher-echo');
      const stub = env.ECHO_HEADERS_DO.get(id);
      const doUrl = new URL(request.url);

      let subResponse: Response;

      if (url.pathname === '/via-init') {
        subResponse = await stub.fetch(doUrl, {
          headers: {
            Authorization: 'Bearer from-init',
            'X-Extra': 'init-extra',
            'X-Merge-Probe': 'via-init-probe',
          },
        });
      } else if (url.pathname === '/via-request') {
        subResponse = await stub.fetch(
          new Request(doUrl, {
            headers: {
              Authorization: 'Bearer from-request',
              'X-Extra': 'request-extra',
              'X-Merge-Probe': 'via-request-probe',
            },
          }),
        );
      } else if (url.pathname === '/via-request-and-init') {
        subResponse = await stub.fetch(
          new Request(doUrl, {
            headers: {
              Authorization: 'Bearer from-request',
              'X-Extra': 'request-extra',
              'X-Merge-Probe': 'dropped-from-request',
            },
          }),
          {
            headers: {
              'X-From-Init': '1',
              'X-Merge-Probe': 'via-init-wins',
            },
          },
        );
      } else if (url.pathname === '/with-preset-sentry-baggage') {
        subResponse = await stub.fetch(
          new Request(doUrl, {
            headers: {
              baggage: 'sentry-environment=preset,acme=vendor',
            },
          }),
        );
      } else {
        return new Response('not found', { status: 404 });
      }

      const payload: unknown = await subResponse.json();
      return Response.json(payload);
    },
  } satisfies ExportedHandler<Env>,
);
