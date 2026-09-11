import { Mastra } from '@mastra/core';
import { registerApiRoute } from '@mastra/core/server';
import { LibSQLStore } from '@mastra/libsql';
import DataLoader from 'dataloader';
import { WEATHER_AGENT, weatherAgent } from './agents/weather-agent.js';

// `Sentry.init` is NOT imported here — it is preloaded via `--import ./instrument.mjs`
// (see the `start` script). Mastra's Rollup drops a side-effect-only import of an
// instrument module from the built entry, so init has to run as a preload, before
// this bundle (and `@mastra/core`) load. No `@sentry/*` is imported into the bundle:
// the preload resolves the SDK from the app root, while the bundle would resolve it
// from `.mastra/output` — a second copy of the same version, which conflicts when a
// bundle-created span is flushed by the preload's client.

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

// Exercises orchestrion-instrumented `dataloader` directly in a route handler.
// `dataloader`'s `load` uses `requiresParentSpan`, so it only emits a `cache.get`
// span when a span is active. The handler runs inside the request's active
// `http.server` span (the same active span Mastra's own spans parent to), which is
// created by the preloaded SDK — so the dataloader span is created by that same SDK
// copy and flushes cleanly. (Driving dataloader through the agent instead produces
// no span: Mastra runs tools with inactive spans, so there is no active parent.)
const dataloaderRoute = registerApiRoute('/dataloader', {
  method: 'POST',
  async handler(c) {
    const loader = new DataLoader<string, number>(async keys => keys.map(key => key.length));
    const counts = await Promise.all(['a', 'bb', 'ccc'].map(name => loader.load(name)));
    return c.json({ counts });
  },
});

export const mastra = new Mastra({
  agents: { [WEATHER_AGENT]: weatherAgent },
  storage: new LibSQLStore({ id: 'mastra-storage', url: ':memory:' }),
  server: {
    port: 4111,
    apiRoutes: [runRoute, dataloaderRoute],
  },
  bundler: {
    // Force `dataloader` external. Mastra externalizes framework packages like
    // `@mastra/core` by default (so orchestrion can hook them), but inlines small
    // pure-JS deps like `dataloader` — and the runtime transform can only
    // instrument a real module, not an inlined one. Keeping it external makes the
    // orchestrion `dataloader` instrumentation work (see tests/dataloader.test.ts).
    // `externals` is merged with Mastra's analyzed externals, so this does not
    // affect `@mastra/core` et al. (Mirrors eve's `externalDependencies: ['dataloader']`.)
    externals: ['dataloader'],
  },
});
