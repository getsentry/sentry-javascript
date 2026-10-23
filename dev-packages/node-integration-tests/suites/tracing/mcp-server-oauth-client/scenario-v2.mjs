import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { startSpan, wrapMcpServerWithSentry } from '@sentry/node';

const requestContext = new AsyncLocalStorage();
let resolverCalls = 0;
const handler = createMcpHandler(async () => {
  await new Promise(resolve => setImmediate(resolve));
  const server = wrapMcpServerWithSentry(new McpServer({ name: 'test-server', version: '1.0.0' }), {
    getOAuthClientName(authInfo) {
      resolverCalls++;
      return authInfo?.extra?.clientName ?? requestContext.getStore();
    },
  });
  server.registerTool('echo', {}, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
  return server;
});

async function request(id, method, clientName, contextName) {
  const params = {
    _meta: {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientCapabilities': {},
      ...(id !== 'missing' && {
        'io.modelcontextprotocol/clientInfo': { name: `protocol-${id}`, version: '1.0.0' },
      }),
    },
  };
  const response = await requestContext.run(contextName, () =>
    handler.fetch(
      new Request('https://example.test/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2026-07-28',
          'MCP-Method': method,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      }),
      {
        authInfo: clientName
          ? { clientId: id, token: 'test-token', scopes: ['test-scope'], extra: { clientName } }
          : undefined,
      },
    ),
  );
  const body = await response.json();
  assert.equal(body.id, id);
  if (method === 'resources/list') {
    assert.equal(response.status, 404);
    assert.equal(body.error.code, -32601);
  } else {
    assert.equal(response.status, 200);
    assert.equal(body.error, undefined);
    if (method === 'tools/list') {
      assert.equal(body.result.tools[0].name, 'echo');
    } else {
      assert.ok(body.result.supportedVersions.includes('2026-07-28'));
    }
  }
}

startSpan({ name: 'oauth requests' }, async span => {
  await Promise.all([
    request('discovery', 'server/discover', 'Registered Discovery'),
    request('context', 'tools/list', undefined, 'Registered Context'),
    request('unsupported', 'resources/list', 'Registered Unsupported'),
    request('missing', 'tools/list'),
  ]);
  assert.equal(resolverCalls, 4);
  await handler.close();
  span.setAttribute('test.responses.checked', true);
});
