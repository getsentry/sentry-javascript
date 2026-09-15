import { Mastra } from '@mastra/core';
import { InMemoryStore } from '@mastra/core/storage';
import { createWeatherAgent, WEATHER_AGENT } from './mastra/agents/weather-agent';

// This file deliberately contains NO `Sentry.*` calls and no import of
// `@sentry/cloudflare`: `sentryCloudflareVitePlugin()` reads wrangler.toml and wraps
// this default export with `withSentry` at build time, sourcing options from
// `instrument.server.ts` next to this entry.

// Built lazily on the first request, then reused across invocations in the isolate.
//
// Order matters: the Sentry Mastra integration subscribes to `@mastra/core`'s
// build-time diagnostics channels during the injected `withSentry` wrapper's
// (per-request) `init`. The `Mastra` constructor is what fires the channel the
// exporter attaches on, so it must run *after* init — i.e. inside `fetch`, never at
// module top level (which would construct it before any subscriber exists). Importing
// `@mastra/core` at the top is fine: that only evaluates the module (registering the
// channel-subscriber factory on the global marker the wrapper reads), it does not
// construct a `Mastra`.
let mastra: Mastra | undefined;

function getMastra(apiKey: string): Mastra {
  if (!mastra) {
    mastra = new Mastra({
      agents: { [WEATHER_AGENT]: createWeatherAgent(apiKey) },
      storage: new InMemoryStore(),
    });
  }
  return mastra;
}

interface GeneratePayload {
  message: string;
  thread?: string;
  resource?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/manual-route') {
      return Response.json({ ok: true });
    }

    if (url.pathname === '/generate' && request.method === 'POST') {
      const { message, thread, resource } = (await request.json()) as GeneratePayload;

      const agent = getMastra(env.E2E_OPENROUTER_API_KEY).getAgent(WEATHER_AGENT);

      // The nested `memory: { thread, resource }` shape is the modern `generate` path —
      // it is what makes Mastra stamp the thread id onto the spans (→
      // `gen_ai.conversation.id`). Top-level `threadId`/`resourceId` would route to the
      // deprecated `generateLegacy` path, which the AI instrumentation does not cover.
      const result = await agent.generate(message, {
        ...(thread ? { memory: { thread, resource: resource ?? 'e2e-user' } } : {}),
      });

      return Response.json({ text: result.text });
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
