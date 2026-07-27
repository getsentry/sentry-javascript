import * as Sentry from '@sentry/cloudflare';
import { Agent, callable, routeAgentRequest } from 'agents';
import { subscribe } from 'node:diagnostics_channel';

interface Env {
  SENTRY_DSN: string;
  MyAgent: DurableObjectNamespace;
}

const CHANNELS = [
  'agents:rpc',
  'agents:schedule',
  'agents:state',
  'agents:lifecycle',
  'agents:message',
  'agents:chat',
  'agents:fiber',
];

class MyAgentBase extends Agent<Env> {
  public channelEvents: string[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    for (const name of CHANNELS) {
      subscribe(name, (event: { type?: string }) => {
        if (event?.type) {
          this.channelEvents.push(event.type);
        }
      });
    }
  }

  @callable()
  public async ping(): Promise<string> {
    return 'pong';
  }

  public async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/count')) {
      return Response.json({ count: this.channelEvents.length, events: this.channelEvents });
    }
    return new Response('ok');
  }
}

export const MyAgent = Sentry.instrumentAgentWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  MyAgentBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(request: Request, env: Env): Promise<Response> {
      return (await routeAgentRequest(request, env)) ?? new Response('Not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
