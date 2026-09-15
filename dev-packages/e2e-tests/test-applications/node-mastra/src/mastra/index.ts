import { Mastra } from '@mastra/core';
import { registerApiRoute } from '@mastra/core/server';
import { LibSQLStore } from '@mastra/libsql';
import * as Sentry from '@sentry/node';
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
  bundler: {
    // Externalize the modules Sentry instruments at runtime via the `--import` orchestrion hook, so
    // they stay unbundled and the hook can transform them (Hono included). In prod (`mastra build`/
    // `start`) we pass the explicit `getInstrumentedModuleNames()` list to make it clear which
    // modules are required. In dev, `mastra dev`'s watcher only honors the boolean `externals: true`
    // preset — it ignores an array, which would leave Hono bundled and un-instrumentable — so we fall
    // back to `true` there. `MASTRA_DEV` is set by the `dev` package script.
    externals: process.env.MASTRA_DEV ? true : Sentry.getInstrumentedModuleNames(),
  },
});

/**
 * TODO
 *
 * 1. Bubbled-up tool errors aren't captured as issues — only reflected on the span (status + error.type); the exporter leaves captureException to the app.
 * 2. Parametrized custom routes aren't route-instrumented on Mastra's Hono server (named from the URL, not a route pattern).
 */
