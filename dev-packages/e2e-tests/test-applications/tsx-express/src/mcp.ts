import express from 'express';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { wrapMcpServerWithSentry } from '@sentry/core';

const mcpRouter = express.Router();

const server = wrapMcpServerWithSentry(
  new McpServer({
    name: 'Echo',
    version: '1.0.0',
  }),
);

server.resource('echo', new ResourceTemplate('echo://{message}', { list: undefined }), async (uri, { message }) => ({
  contents: [
    {
      uri: uri.href,
      text: `Resource echo: ${message}`,
    },
  ],
}));

server.tool('echo', { message: z.string() }, async ({ message }, rest) => {
  return {
    content: [{ type: 'text', text: `Tool echo: ${message}` }],
  };
});

server.prompt('echo', { message: z.string() }, ({ message }, extra) => ({
  messages: [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Please process this message: ${message}`,
      },
    },
  ],
}));

const transports: Record<string, SSEServerTransport> = {};

mcpRouter.get('/sse', async (_, res) => {
  const transport = new SSEServerTransport('/messages', res);
  transports[transport.sessionId] = transport;
  res.on('close', () => {
    delete transports[transport.sessionId];
  });
  await server.connect(transport);
});

mcpRouter.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId as string];
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send('No transport found for sessionId');
  }
});

export { mcpRouter };
