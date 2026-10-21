import { createTool } from '@mastra/core/tools';
import DataLoader from 'dataloader';
import { z } from 'zod';

// Uses the orchestrion-instrumented `dataloader` inside a tool, to prove the build-time
// orchestrion transform (via `@sentry/cloudflare/vite`) works for a non-Mastra package
// driven through the agent's tool-call flow.
export const countItemsTool = createTool({
  id: 'count_items',
  description: 'Count the number of letters in each given name. Call this when asked to count items.',
  inputSchema: z.object({ names: z.array(z.string()).min(1) }),
  outputSchema: z.object({ counts: z.array(z.number()) }),
  async execute(inputData) {
    const loader = new DataLoader<string, number>(async keys => keys.map(key => key.length));
    const counts = await Promise.all(inputData.names.map(name => loader.load(name)));
    return { counts };
  },
});
