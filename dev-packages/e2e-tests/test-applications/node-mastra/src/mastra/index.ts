import { Mastra } from '@mastra/core';
import { registerApiRoute } from '@mastra/core/server';
import { LibSQLStore } from '@mastra/libsql';
import { WEATHER_AGENT, weatherAgent } from './agents/weather-agent.js';

// `Sentry.init` is NOT imported here — it is preloaded via `--import ./instrument.mjs`
// (see the `start` script). Mastra's Rollup drops a side-effect-only import of an
// instrument module from the built entry, so init has to run as a preload, before
// this bundle (and `@mastra/core`) load. That preload also keeps `@sentry/*` out of
// the bundle entirely, so no `transpilePackages`/`externals` are needed for Sentry.

interface RunBody {
  message: string;
  thread?: string;
  resource?: string;
}

// A custom route (rather than the built-in `/api/agents/:id/generate`) so we can
// pass the modern nested `memory: { thread, resource }` shape to `generate()`.
// That is what makes Mastra engage memory and stamp the thread id onto the
// AI-tracing spans (as `metadata.threadId` / `attributes.conversationId`, which the
// exporter maps to `gen_ai.conversation.id`); the built-in endpoint's top-level
// `threadId`/`resourceId` do not populate tracing metadata.
const runRoute = registerApiRoute('/run', {
  method: 'POST',
  async handler(c) {
    const mastra = c.get('mastra');
    const { message, thread, resource } = (await c.req.json()) as RunBody;
    const agent = mastra.getAgent(WEATHER_AGENT);
    const result = await agent.generate(
      message,
      thread ? { memory: { thread, resource: resource ?? 'e2e-user' } } : {},
    );
    return c.json({ text: result.text });
  },
});

export const mastra = new Mastra({
  agents: { [WEATHER_AGENT]: weatherAgent },
  storage: new LibSQLStore({ id: 'mastra-storage', url: ':memory:' }),
  server: {
    port: 4111,
    apiRoutes: [runRoute],
  },
});
