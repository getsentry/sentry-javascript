const assert = require('node:assert/strict');

module.exports = async function run({ Client, InMemoryTransport, McpServer, Sentry }) {
  await Sentry.startSpan({ name: 'handler-regression' }, async span => {
    const calls = { tool: 0, resource: 0, prompt: 0, existingResource: 0 };
    const failOnce = (name, result) => () => {
      calls[name] += 1;
      if (calls[name] === 1) {
        throw new Error(`${name} failed`);
      }
      return result;
    };
    const server = new McpServer({ name: 'handler-test-server', version: '1.0.0' });
    server.registerResource(
      'existingResource',
      'test://existing-resource',
      {},
      failOnce('existingResource', { contents: [{ uri: 'test://existing-resource', text: 'unexpected retry' }] }),
    );
    Sentry.wrapMcpServerWithSentry(server);
    server.registerTool('tool', {}, failOnce('tool', { content: [{ type: 'text', text: 'unexpected retry' }] }));
    server.registerResource(
      'resource',
      'test://resource',
      {},
      failOnce('resource', { contents: [{ uri: 'test://resource', text: 'unexpected retry' }] }),
    );
    server.registerPrompt(
      'prompt',
      {},
      failOnce('prompt', { messages: [{ role: 'user', content: { type: 'text', text: 'unexpected retry' } }] }),
    );
    const client = new Client({ name: 'handler-test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      assert.deepEqual(await client.callTool({ name: 'tool', arguments: {} }), {
        content: [{ type: 'text', text: 'tool failed' }],
        isError: true,
      });
      await assert.rejects(client.readResource({ uri: 'test://resource' }), /resource failed$/);
      await assert.rejects(client.getPrompt({ name: 'prompt' }), /prompt failed$/);
      await assert.rejects(client.readResource({ uri: 'test://existing-resource' }), /existingResource failed$/);
      assert.deepEqual(calls, { tool: 1, resource: 1, prompt: 1, existingResource: 1 });
    } finally {
      await client.close();
      await server.close();
    }
    span.setAttribute('test.mcp.handlers_verified', 4);
  });
};
