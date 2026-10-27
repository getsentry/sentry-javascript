import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { wrapMcpServerWithSentry } from '@sentry/node';

const server = wrapMcpServerWithSentry(new McpServer({ name: 'Echo', version: '1.0.0' }));

async function run() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { versionNegotiation: { mode: 'legacy' } });
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
