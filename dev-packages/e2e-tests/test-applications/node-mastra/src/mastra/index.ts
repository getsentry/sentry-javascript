import { startSpan } from '@sentry/node';
import { Mastra } from '@mastra/core';
import { registerApiRoute } from '@mastra/core/server';
import { LibSQLStore } from '@mastra/libsql';
import DataLoader from 'dataloader';
import { WEATHER_AGENT, weatherAgent } from './agents/weather-agent.js';

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

// Exercises the auto-instrumented `dataloader` in a route handler. `dataloader`'s
// `load` needs an active parent span to emit a `cache.get` span — the handler runs
// inside the request's active `http.server` span (created by the preloaded SDK), so
// the span is created and flushed by that same SDK copy. (Driving dataloader through
// the agent instead produces no span: Mastra runs tools with inactive spans, so
// there is no active parent; and creating one with `startSpan` here isn't possible —
// see the header note on the two-copies limitation.)
const dataloaderRoute = registerApiRoute('/dataloader', {
  method: 'POST',
  handler(c) {
    return startSpan({ name: 'dataloader-test', op: 'test' }, async () => {
      const loader = new DataLoader<string, number>(async keys => keys.map(key => key.length));
      const counts = await Promise.all(['a', 'bb', 'ccc'].map(name => loader.load(name)));
      return c.json({ counts });
    });
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
    // `dataloader` must stay a real module so it can be instrumented. `@mastra/core`
    // is forced external too (diagnostic): if Mastra inlined it, the orchestrion
    // runtime hook could never transform its constructor.
    externals: ['dataloader', '@mastra/core', '@sentry/node'],
  },
});

/**
 * TODO
 *
 *
 *  1. Tool result not captured — Mastra doesn't populate output on exported tool_call spans, so gen_ai.tool.call.result is empty (arguments are captured).
  2. Bubbled-up tool errors aren't captured as issues — only reflected on the span (status + error.type); the exporter leaves captureException to the app.
  3. Conversation id needs the nested memory: { thread, resource } API — the built-in REST endpoint's top-level threadId/resourceId don't populate tracing metadata.
  4. Two SDK copies when creating spans from the Mastra bundle — mastra build's separate output install + preload-init means bundle-created spans (startSpan) conflict with the preload's client. Auto-instrumentation
     is unaffected; manual Sentry span APIs in bundled Mastra code are the sharp edge. (This is why dataloader is exercised via the active http.server span, not a manual startSpan.)
  5. dataloader/requiresParentSpan — orchestrion span-openers need an active parent; Mastra runs tools with inactive spans, so they don't emit in the agent flow.
 */
