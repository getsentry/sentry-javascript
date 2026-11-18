import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import { startMockServer, streamSseEvents } from '@sentry-internal/node-integration-tests';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    const model = req.body.model;

    // Non-streaming request (the nested call made from the stream event handler).
    if (!req.body.stream) {
      res.send({
        id: 'msg_nested',
        type: 'message',
        model,
        role: 'assistant',
        content: [{ type: 'text', text: 'nested reply' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 3, output_tokens: 4 },
      });
      return;
    }

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
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello!' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 15 } },
      { type: 'message_stop' },
    ];
    streamSseEvents(res, events, { eventNames: true });
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockAnthropicServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Anthropic({
      apiKey: 'mock-api-key',
      baseURL: `${server.url}/anthropic`,
    });

    const stream = client.messages.stream({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Stream this please' }],
    });

    // Fire a separate, non-streaming request from a stream event handler. This runs inside the
    // stream's async continuation, so the streaming-helper span is still the active span here.
    // It must still be traced (the dedup must only suppress the helper's own internal `create`).
    let resolveNested;
    const nested = new Promise(resolve => (resolveNested = resolve));
    let fired = false;
    stream.on('streamEvent', () => {
      if (fired) return;
      fired = true;
      client.messages
        .create({
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: 'Nested call from handler' }],
          max_tokens: 10,
        })
        .then(resolveNested, resolveNested);
    });

    for await (const _ of stream) {
      void _;
    }
    await nested;
  });

  await Sentry.flush(2000);

  server.close();
}

run();
