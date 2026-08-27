import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import { wrapMcpServerWithSentry } from '@sentry/node';

const server = wrapMcpServerWithSentry(new McpServer({ name: 'Echo', version: '1.0.0' }));

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
