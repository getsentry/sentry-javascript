import * as Sentry from '@sentry/node';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';

const server = new McpServer({ name: 'Echo', version: '1.0.0' }, { capabilities: { logging: {} } });

server.registerTool('echo', {}, async ctx => {
  await ctx.mcpReq.notify({ method: 'notifications/message', params: { level: 'info', data: 'echoing' } });
  await ctx.mcpReq.elicitInput({
    message: 'Confirm echo',
    requestedSchema: { type: 'object', properties: { confirm: { type: 'boolean' } } },
  });
  return { content: [{ type: 'text', text: 'Tool echo' }] };
});

async function run() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: { elicitation: { form: {} } } });

  // The client is not instrumented, so it continues the trace by hand to show what the server put on the wire.
  const continueFromMeta = (params, name) => {
    const meta = params._meta ?? {};
    Sentry.continueTrace({ sentryTrace: meta['sentry-trace'], baggage: meta.baggage }, () => {
      Sentry.startSpan({ name, op: 'test.client', forceTransaction: true }, () => undefined);
    });
  };

  client.setNotificationHandler('notifications/message', notification => {
    continueFromMeta(notification.params, 'handle log message');
  });
  client.setRequestHandler('elicitation/create', request => {
    continueFromMeta(request.params, 'handle elicitation');
    return { action: 'accept', content: { confirm: true } };
  });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  await client.callTool({ name: 'echo', arguments: {} });

  await client.close();
  await server.close();
}

run();
