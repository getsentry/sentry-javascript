import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import { anthropicMessageStream, startMockServer, streamSseEvents } from '@sentry-internal/node-integration-tests';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    const model = req.body.model;
    const events = anthropicMessageStream(model, { content: 'Hello from stream!' });

    streamSseEvents(res, events, { eventNames: true });
  });

  return startMockServer(app);
}

// Minimal stand-in for a third-party library that also instruments the client by wrapping
// `messages.create` (e.g. Braintrust's `wrapAnthropic`). Our instrumentation must not hide the
// client's own `create` from it when the SDK's `messages.stream()` helper delegates internally.
function wrapClient(client) {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== 'messages') {
        return Reflect.get(target, prop, receiver);
      }
      return new Proxy(Reflect.get(target, prop, receiver), {
        get(messages, messagesProp, messagesReceiver) {
          if (messagesProp !== 'create') {
            return Reflect.get(messages, messagesProp, messagesReceiver);
          }
          const originalCreate = Reflect.get(messages, messagesProp, messagesReceiver);
          return function (...args) {
            Sentry.captureMessage('third-party wrapper observed messages.create');
            return originalCreate.apply(this, args);
          };
        },
      });
    },
  });
}

async function run() {
  const server = await startMockAnthropicServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = wrapClient(
      new Anthropic({
        apiKey: 'mock-api-key',
        baseURL: `${server.url}/anthropic`,
      }),
    );

    const stream = client.messages.stream({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Stream this please' }],
    });
    for await (const _ of stream) {
      void _;
    }
  });

  await Sentry.flush(2000);

  server.close();
}

run();
