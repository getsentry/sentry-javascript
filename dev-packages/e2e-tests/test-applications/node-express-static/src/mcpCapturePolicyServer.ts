import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { wrapMcpServerWithSentry } from '@sentry/node';
import { z } from 'zod';

export const capturePolicyServer = wrapMcpServerWithSentry(
  new McpServer({
    name: 'Capture-Policy',
    version: '1.0.0',
  }),
);

capturePolicyServer.tool('capture-policy', { message: z.string() }, async ({ message }) => {
  return {
    content: [{ type: 'text', text: `Capture policy result: ${message}` }],
  };
});
