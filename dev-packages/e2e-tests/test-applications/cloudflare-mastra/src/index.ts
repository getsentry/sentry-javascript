import { Mastra } from '@mastra/core';
import { InMemoryStore } from '@mastra/core/storage';
import { createWeatherAgent, WEATHER_AGENT } from './mastra/agents/weather-agent';

const mastra = new Mastra({
  agents: { [WEATHER_AGENT]: createWeatherAgent(process.env.E2E_OPENROUTER_API_KEY ?? '') },
  storage: new InMemoryStore(),
});

interface GeneratePayload {
  message: string;
  thread?: string;
  resource?: string;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/manual-route') {
      return Response.json({ ok: true });
    }

    if (url.pathname === '/generate' && request.method === 'POST') {
      const { message, thread, resource } = (await request.json()) as GeneratePayload;

      const agent = mastra.getAgent(WEATHER_AGENT);

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
