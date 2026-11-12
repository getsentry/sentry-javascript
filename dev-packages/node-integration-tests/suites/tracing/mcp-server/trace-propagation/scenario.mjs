import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';

const server = new McpServer({ name: 'Echo', version: '1.0.0' });

server.registerTool('echo', {}, async () => ({ content: [{ type: 'text', text: 'Tool echo' }] }));

async function run() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  await client.callTool({
    name: 'echo',
    arguments: {},
    _meta: { 'sentry-trace': '4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-1' },
  });

  await client.close();
  await server.close();
}

run();
