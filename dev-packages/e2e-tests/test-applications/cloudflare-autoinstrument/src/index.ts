import { AIChatAgent } from '@cloudflare/ai-chat';
import { Agent, callable, routeAgentRequest } from 'agents';
import { DurableObject } from 'cloudflare:workers';
import { MyBase } from './base';
import { ImportedAgent } from './imported-agent';

export { ImportedAgent };
export { ReExportedAgent } from './reexported-agent';

// The two exports above live in their own modules — see `imported-agent.ts` and
// `reexported-agent.ts`. They cover the shapes an entry that only aggregates
// classes uses, where there is no local declaration for the plugin to rewrite.
//
// NOTE: this file deliberately contains NO `Sentry.*` calls and no import of
// `@sentry/cloudflare`. Everything below is wrapped at build time by
// `sentryCloudflareVitePlugin({ _experimental: { autoInstrumentation: true } })`,
// which reads wrangler.jsonc, wraps the default export with `withSentry`, and
// picks a wrapper per class: `instrumentAgentWithSentry` for the five Agents,
// `instrumentDurableObjectWithSentry` for the plain Durable Object.
//
// Options come from `instrument.server.ts` next to this entry.

/** Agent whose base class (`Agent`) is imported directly into the entry. */
export class MyAgent extends Agent<Env> {
  @callable()
  async greet(name: string): Promise<string> {
    return `Hello, ${name}! (from MyAgent)`;
  }

  async onRequest(): Promise<Response> {
    return Response.json({ agent: 'plain' });
  }
}

/** Chat agent — `AIChatAgent` extends `Agent` inside `@cloudflare/ai-chat`. */
export class MyChatAgent extends AIChatAgent<Env> {
  @callable()
  async greet(name: string): Promise<string> {
    return `Hello, ${name}! (from MyChatAgent)`;
  }

  async onRequest(): Promise<Response> {
    return Response.json({ agent: 'chat' });
  }
}

/** Agent whose base class lives in `./base` — resolvable only across modules. */
export class DerivedAgent extends MyBase {
  @callable()
  async greet(name: string): Promise<string> {
    return `Hello, ${name}! (from DerivedAgent)`;
  }
}

/**
 * A genuine Durable Object. Configured identically to the Agents above, so it
 * proves detection discriminates rather than upgrading every DO binding.
 */
export class PlainDO extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    return Response.json({ durableObject: true });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/plain-do') {
      const stub = env.PlainDO.get(env.PlainDO.idFromName('do-instance'));
      return stub.fetch(request);
    }

    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) {
      return agentResponse;
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
