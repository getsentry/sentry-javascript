import { Mastra } from '@mastra/core';
import { registerApiRoute } from '@mastra/core/server';
import { LibSQLStore } from '@mastra/libsql';
import { WEATHER_AGENT, weatherAgent } from './agents/weather-agent.js';
import { SentryMastraExporter } from '@sentry/node';
import * as Sentry from '@sentry/node';

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
    externals: Sentry.getInstrumentedModuleNames(),
  },
});

/**
 * TODO
 *
 * 1. Bubbled-up tool errors aren't captured as issues — only reflected on the span (status + error.type); the exporter leaves captureException to the app.
 * 2. Parametrized custom routes aren't route-instrumented on Mastra's Hono server (named from the URL, not a route pattern).
 */
