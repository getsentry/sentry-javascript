import { Mastra } from '@mastra/core';
import { registerApiRoute } from '@mastra/core/server';
import { LibSQLStore } from '@mastra/libsql';
import { WEATHER_AGENT, weatherAgent } from './agents/weather-agent.js';

// The agent is driven through Mastra's built-in `POST /api/agents/:id/generate`
// endpoint (see tests/utils.ts). `dataloader` (orchestrion-instrumented) is exercised
// through the agent's `count_items` tool (see src/mastra/tools/count-items.ts); its
// `cache.get` spans nest under the tool span because the Mastra integration makes the
// exporter's spans active during execution.

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
  // No `bundler.externals` override: `mastra build` defaults to externalizing all non-workspace deps,
  // so Hono (and the other instrumented modules) stay unbundled and the `--import` orchestrion hook
  // can transform them in prod. In `mastra dev` the bundler inlines its own Hono-based server
  // framework into the entry regardless of any `externals` config, so Hono is not
  // orchestrion-instrumented in dev — the tests assert the un-routed span name there.
});

/**
 * TODO
 *
 * 1. Parametrized custom routes aren't route-instrumented on Mastra's Hono server (named from the URL, not a route pattern).
 */
