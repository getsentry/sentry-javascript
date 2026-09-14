import { Mastra } from '@mastra/core';
import { registerApiRoute } from '@mastra/core/server';
import { LibSQLStore } from '@mastra/libsql';
import { WEATHER_AGENT, weatherAgent } from './agents/weather-agent.js';

// The agent is driven through Mastra's built-in `POST /api/agents/:id/generate`
// endpoint (see tests/utils.ts). `dataloader` (orchestrion-instrumented) is now
// exercised through the agent's `count_items` tool (see src/mastra/tools/count-items.ts).

// A plain (static) custom route: verifies requests to app-registered routes are wrapped in an
// `http.server` span. With the Mastra integration's route naming, the span is named `GET /manual-route`
// (name source `route`, `http.route` set) — see tests/manual-route.test.ts.
const manualRoute = registerApiRoute('/manual-route', {
  method: 'GET',
  handler(c) {
    return c.json({ ok: true });
  },
});

// A parametrized custom route: verifies the integration names the `http.server` span from the matched
// route *pattern* (`GET /echo/:id`), not the raw URL — so `/echo/42` and `/echo/99` collapse to one
// low-cardinality transaction with `http.route: /echo/:id`.
const echoRoute = registerApiRoute('/echo/:id', {
  method: 'GET',
  handler(c) {
    return c.json({ id: c.req.param('id') });
  },
});

export const mastra = new Mastra({
  agents: { [WEATHER_AGENT]: weatherAgent },
  storage: new LibSQLStore({ id: 'mastra-storage', url: ':memory:' }),
  server: {
    port: 4111,
    apiRoutes: [manualRoute, echoRoute],
  },
});

/**
 * TODO
 *
 *
  1. Bubbled-up tool errors aren't captured as issues — only reflected on the span (status + error.type); the exporter leaves captureException to the app.
  2. Mastra runs tools with inactive spans, so the `count_items` tool must open its own active span (startSpan) for dataloader's `cache.get` span to emit.
  */
