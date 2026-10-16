const assert = require('node:assert/strict');

module.exports = async function run(server, client, InMemoryTransport, z) {
  server.registerTool('echo', { inputSchema: { message: z.string() } }, async ({ message }) => ({
    content: [{ type: 'text', text: message }],
    structuredContent: { echoed: message },
    _meta: { privateContext: 'private-result-metadata' },
    requestState: 'private-request-state',
  }));
  server.registerTool('failure', {}, async () => ({
    content: [{ type: 'text', text: 'Tool failed' }],
    isError: true,
  }));
  server.registerPrompt('greeting', { argsSchema: { Language: z.string() } }, async ({ Language }) => ({
    messages: [{ role: 'user', content: { type: 'text', text: `Hello in ${Language}` } }],
  }));

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const echo = await client.callTool({ name: 'echo', arguments: { message: 'Hello' } });
  assert.deepEqual(echo.structuredContent, { echoed: 'Hello' });
  assert.equal(echo._meta.privateContext, 'private-result-metadata');
  const failure = await client.callTool({ name: 'failure', arguments: {} });
  assert.equal(failure.isError, true);
  const prompt = await client.getPrompt({ name: 'greeting', arguments: { Language: 'English' } });
  assert.equal(prompt.messages[0].content.text, 'Hello in English');
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 2);

  await client.close();
  await server.close();
};
