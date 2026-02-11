import { randomUUID } from 'node:crypto';
import express from 'express';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { wrapMcpServerWithSentry } from '@sentry/node';

// Helper to check if request is an initialize request (compatible with all MCP SDK versions)
function isInitializeRequest(body: unknown): boolean {
  return typeof body === 'object' && body !== null && (body as { method?: string }).method === 'initialize';
}

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
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).send('No transport found for sessionId');
  }
});

// =============================================================================
// Streamable HTTP Transport Endpoints
// This uses StreamableHTTPServerTransport which wraps WebStandardStreamableHTTPServerTransport
// and exercises the wrapper transport pattern that was fixed in the sessionId-based correlation
// See: https://github.com/getsentry/sentry-mcp/issues/767
// =============================================================================

// Create a separate wrapped server for streamable HTTP (to test independent of SSE)
const streamableServer = wrapMcpServerWithSentry(
  new McpServer({
    name: 'Echo-Streamable',
    version: '1.0.0',
  }),
);

// Register the same handlers on the streamable server
streamableServer.resource(
  'echo',
  new ResourceTemplate('echo://{message}', { list: undefined }),
  async (uri, { message }) => ({
    contents: [
      {
        uri: uri.href,
        text: `Resource echo: ${message}`,
      },
    ],
  }),
);

streamableServer.tool('echo', { message: z.string() }, async ({ message }) => {
  return {
    content: [{ type: 'text', text: `Tool echo: ${message}` }],
  };
});

streamableServer.prompt('echo', { message: z.string() }, ({ message }) => ({
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

// Map to store streamable transports by session ID
const streamableTransports: Record<string, StreamableHTTPServerTransport> = {};

// POST endpoint for streamable HTTP (handles both initialization and subsequent requests)
mcpRouter.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && streamableTransports[sessionId]) {
      // Reuse existing transport for session
      transport = streamableTransports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request - create new transport
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: sid => {
          // Store transport when session is initialized
          streamableTransports[sid] = transport;
        },
      });

      // Clean up on close
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && streamableTransports[sid]) {
          delete streamableTransports[sid];
        }
      };

      // Connect to server before handling request
      await streamableServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      // Invalid request
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null,
      });
      return;
    }

    // Handle request with existing transport
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling streamable HTTP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

// GET endpoint for SSE streams (server-initiated messages)
mcpRouter.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !streamableTransports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  const transport = streamableTransports[sessionId];
  await transport.handleRequest(req, res);
});

// DELETE endpoint for session termination
mcpRouter.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !streamableTransports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  const transport = streamableTransports[sessionId];
  await transport.handleRequest(req, res);
});

export { mcpRouter };
