import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const failNowTool = createTool({
  id: 'fail_now',
  description: 'Always throws an error. Call this when the user asks to trigger a failure.',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  async execute() {
    throw new Error('Intentional Mastra tool failure');
  },
});
