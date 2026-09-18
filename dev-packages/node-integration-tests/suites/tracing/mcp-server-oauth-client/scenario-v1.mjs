import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { startSpan, wrapMcpServerWithSentry } from '@sentry/node';

const requestContext = new AsyncLocalStorage();
let resolverCalls = 0;
const server = wrapMcpServerWithSentry(new McpServer({ name: 'test-server', version: '1.0.0' }), {
  getOAuthClientName(authInfo) {
    resolverCalls++;
    return authInfo?.extra?.clientName ?? requestContext.getStore();
  },
});
server.registerTool('echo', {}, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: () => 'test-session',
  enableJsonResponse: true,
});

async function request(id, method, clientName, contextName) {
  const params =
    method === 'initialize'
      ? { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'protocol-v1', version: '1.0.0' } }
      : {};
  const response = await requestContext.run(contextName, async () => {
    await new Promise(resolve => setImmediate(resolve));
    return transport.handleRequest(
      new Request('https://example.test/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2025-11-25',
          ...(method !== 'initialize' && { 'Mcp-Session-Id': 'test-session' }),
        },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      }),
      {
        authInfo: clientName
          ? { clientId: id, token: 'test-token', scopes: ['test-scope'], extra: { clientName } }
          : undefined,
      },
    );
  });
  if (id === undefined) {
    assert.equal(response.status, 202);
    return;
  }
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.id, id);
  if (method === 'resources/list') {
    assert.equal(body.error.code, -32601);
  } else {
    assert.equal(body.error, undefined);
    if (method === 'tools/list') {
      assert.equal(body.result.tools[0].name, 'echo');
    } else {
      assert.equal(body.result.protocolVersion, '2025-11-25');
    }
  }
}

startSpan({ name: 'oauth requests' }, async span => {
  await server.connect(transport);
  await request('discovery', 'initialize', 'Registered Discovery');
  await request(undefined, 'notifications/initialized', 'Notification Client');
  await Promise.all([
    request('context', 'tools/list', undefined, 'Registered Context'),
    request('unsupported', 'resources/list', 'Registered Unsupported'),
    request('missing', 'tools/list'),
  ]);
  assert.equal(resolverCalls, 4);
  await server.close();
  span.setAttribute('test.responses.checked', true);
});
