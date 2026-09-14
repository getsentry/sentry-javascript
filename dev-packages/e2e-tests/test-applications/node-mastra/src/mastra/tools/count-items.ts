import { startSpan } from '@sentry/node';
import { createTool } from '@mastra/core/tools';
import DataLoader from 'dataloader';
import { z } from 'zod';

// Uses the orchestrion-instrumented `dataloader` inside a tool, to prove orchestrion
// works for a non-Mastra package driven through the agent's tool-call flow — and
// that a tool can use bundle-side `Sentry.startSpan` (single SDK copy; see
// src/mastra/index.ts).
//
// The `startSpan` wrapper is required: Mastra runs tools with inactive spans, and
// `dataloader`'s `load` only emits its `cache.get` span when a span is active. So
// the tool opens one explicitly, and `dataloader.load` nests under it.
export const countItemsTool = createTool({
  id: 'count_items',
  description: 'Count the number of letters in each given name. Call this when asked to count items.',
  inputSchema: z.object({ names: z.array(z.string()).min(1) }),
  outputSchema: z.object({ counts: z.array(z.number()) }),
  async execute(inputData) {
    return startSpan({ name: 'count-items', op: 'function' }, async () => {
      const loader = new DataLoader<string, number>(async keys => keys.map(key => key.length));
      const counts = await Promise.all(inputData.names.map(name => loader.load(name)));
      return { counts };
    });
  },
});
