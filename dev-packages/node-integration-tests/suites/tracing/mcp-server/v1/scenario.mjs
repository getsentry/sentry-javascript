import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

// Intentionally NOT wrapped with `wrapMcpServerWithSentry`: the `mcpServer` integration
// auto-instruments the `McpServer` constructor via orchestrion, so spans must appear anyway.
const server = new McpServer({ name: 'Echo', version: '1.0.0' });

server.registerResource('echo', new ResourceTemplate('echo://{message}', { list: undefined }), {}, async uri => ({
  contents: [{ uri: uri.href, text: 'Resource echo' }],
}));

server.registerTool('echo', {}, async () => ({ content: [{ type: 'text', text: 'Tool echo' }] }));

async function run() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  await client.readResource({ uri: 'echo://foobar' });
  await client.callTool({ name: 'echo', arguments: {} });

  await client.close();
  await server.close();
}

run();
