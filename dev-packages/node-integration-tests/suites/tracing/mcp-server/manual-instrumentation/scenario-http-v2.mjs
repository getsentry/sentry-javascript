import assert from 'node:assert/strict';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { wrapMcpServerWithSentry } from '@sentry/node';

const handler = createMcpHandler(() => {
  const server = wrapMcpServerWithSentry(new McpServer({ name: 'Echo', version: '1.0.0' }));
  server.registerTool('echo', {}, async () => ({ content: [{ type: 'text', text: 'Tool echo' }] }));
  return server;
});

async function request(id, method, userAgent) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'Mcp-Protocol-Version': '2026-07-28',
    'Mcp-Method': method,
  };
  if (userAgent !== undefined) {
    headers['User-Agent'] = userAgent;
  }

  const response = await handler.fetch(
    new Request('https://example.test/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    }),
  );
  return response.json();
}

async function run() {
  const [discovery, tools, resources] = await Promise.all([
    request(1, 'server/discover', 'discovery-client/1.0'),
    request(2, 'tools/list', 'tools-client/2.0'),
    request(3, 'resources/list', 'resources-client/3.0'),
  ]);
  assert.ok(discovery.result);
  assert.equal(tools.result.tools[0].name, 'echo');
  assert.equal(resources.error.code, -32601);
  assert.ok((await request(4, 'tools/list')).result);
}

run();
