import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { wrapMcpServerWithSentry } from '@sentry/node';

class CustomTransport extends WebStandardStreamableHTTPServerTransport {}

const server = wrapMcpServerWithSentry(new McpServer({ name: 'Echo', version: '1.0.0' }));
server.registerTool('echo', {}, async () => ({ content: [{ type: 'text', text: 'Tool echo' }] }));
const transport = new CustomTransport({ sessionIdGenerator: () => 'test-session', enableJsonResponse: true });

async function request(id, method, userAgent, params) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'Mcp-Protocol-Version': '2025-11-25',
  };
  if (userAgent !== undefined) {
    headers['User-Agent'] = userAgent;
  }
  if (transport.sessionId !== undefined) {
    headers['Mcp-Session-Id'] = transport.sessionId;
  }

  const response = await transport.handleRequest(
    new Request('https://example.test/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    }),
  );
  return response.status === 202 ? undefined : response.json();
}

async function run() {
  await server.connect(transport);
  const initialize = await request(1, 'initialize', 'initialize-client/1.0', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  });
  assert.ok(initialize.result);
  await request(undefined, 'notifications/initialized');

  const [tools, resources] = await Promise.all([
    request(2, 'tools/list', 'tools-client/2.0'),
    request(3, 'resources/list', 'resources-client/3.0'),
  ]);
  assert.equal(tools.result.tools[0].name, 'echo');
  assert.equal(resources.error.code, -32601);
  assert.ok((await request(4, 'tools/list')).result);
  await server.close();
}

run();
