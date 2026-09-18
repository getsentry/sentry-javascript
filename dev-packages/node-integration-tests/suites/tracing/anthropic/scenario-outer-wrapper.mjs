import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const model = req.body.model;
    const events = [
      {
        type: 'message_start',
        message: {
          id: 'msg_stream_1',
          type: 'message',
          role: 'assistant',
          model,
          content: [],
          usage: { input_tokens: 10 },
        },
      },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'from ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'stream!' } },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 15 },
      },
      { type: 'message_stop' },
    ];

    events.forEach((event, index) => {
      setTimeout(() => {
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (index === events.length - 1) {
          res.end();
        }
      }, index * 10);
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
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
        baseURL: `http://localhost:${server.address().port}/anthropic`,
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
