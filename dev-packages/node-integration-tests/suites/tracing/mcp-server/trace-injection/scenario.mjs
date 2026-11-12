import * as Sentry from '@sentry/node';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';

const server = new McpServer({ name: 'Echo', version: '1.0.0' }, { capabilities: { logging: {} } });

server.registerTool('echo', {}, async ctx => {
  await ctx.mcpReq.notify({ method: 'notifications/message', params: { level: 'info', data: 'echoing' } });
  return { content: [{ type: 'text', text: 'Tool echo' }] };
});

async function run() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });

  // The client is not instrumented, so it continues the trace by hand to show what the server put on the wire.
  client.setNotificationHandler('notifications/message', notification => {
    const meta = notification.params._meta ?? {};
    Sentry.continueTrace({ sentryTrace: meta['sentry-trace'], baggage: meta.baggage }, () => {
      Sentry.startSpan({ name: 'handle log message', op: 'test.client', forceTransaction: true }, () => undefined);
    });
  });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  await client.callTool({ name: 'echo', arguments: {} });

  await client.close();
  await server.close();
}

run();
