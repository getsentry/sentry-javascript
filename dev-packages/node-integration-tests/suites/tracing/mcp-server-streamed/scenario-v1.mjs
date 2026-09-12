import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { wrapMcpServerWithSentry } from '@sentry/node';

const server = wrapMcpServerWithSentry(new McpServer({ name: 'Echo', version: '1.0.0' }));

async function run() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const originalSend = clientTransport.send.bind(clientTransport);
  const requestQueued = new Promise(resolve => {
    clientTransport.send = async (...args) => {
      const result = await originalSend(...args);
      if (args[0]?.method === 'initialize') {
        resolve();
      }
      return result;
    };
  });

  const clientConnection = client.connect(clientTransport);
  await requestQueued;
  await server.connect(serverTransport);
  await clientConnection;

  await client.close();
  await server.close();
}

run();
