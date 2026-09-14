import { Mastra } from '@mastra/core';
import { registerApiRoute } from '@mastra/core/server';
import { LibSQLStore } from '@mastra/libsql';
import { WEATHER_AGENT, weatherAgent } from './agents/weather-agent.js';

// The agent is driven through Mastra's built-in `POST /api/agents/:id/generate`
// endpoint (see tests/utils.ts). `dataloader` (orchestrion-instrumented) is now
// exercised through the agent's `count_items` tool (see src/mastra/tools/count-items.ts).

// A plain custom route to verify that requests to app-registered routes are
// wrapped in an `http.server` span with the correct route attributes (method,
// route pattern, status code) — independent of the agent/AI instrumentation.
const manualRoute = registerApiRoute('/manual-route', {
  method: 'GET',
  handler(c) {
    return c.json({ ok: true });
  },
});

export const mastra = new Mastra({
  agents: { [WEATHER_AGENT]: weatherAgent },
  storage: new LibSQLStore({ id: 'mastra-storage', url: ':memory:' }),
  server: {
    port: 4111,
    apiRoutes: [manualRoute],
  },
});

/**
 * TODO
 *
 *
  1. Bubbled-up tool errors aren't captured as issues — only reflected on the span (status + error.type); the exporter leaves captureException to the app.
  2. Mastra runs tools with inactive spans, so the `count_items` tool must open its own active span (startSpan) for dataloader's `cache.get` span to emit.
  3. parametrized routes for mastra?
  */
