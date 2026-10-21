import DataLoader from 'dataloader';
import { defineTool } from 'eve/tools';
import { z } from 'zod';

// Uses `dataloader` so the e2e test can assert Sentry's orchestrion-based
// instrumentation of it. Unlike the Vercel AI SDK (native diagnostics channel),
// orchestrion packages are only instrumented when the Sentry loader is
// registered at process start (the "orchestrion" test variant).
export default defineTool({
  description: 'Count the number of letters in each given name. Call this when asked to count items.',
  inputSchema: z.object({ names: z.array(z.string()).min(1) }),
  async execute({ names }) {
    const loader = new DataLoader<string, number>(async keys => keys.map(k => k.length));
    const counts = await Promise.all(names.map(n => loader.load(n)));
    return { counts };
  },
});
