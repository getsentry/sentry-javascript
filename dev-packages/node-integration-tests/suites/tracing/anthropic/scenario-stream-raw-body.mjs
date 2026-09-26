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
          id: 'msg_raw_body',
          type: 'message',
          role: 'assistant',
          model,
          content: [],
          usage: { input_tokens: 10 },
        },
      },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Raw ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'body!' } },
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

async function run() {
  const server = await startMockAnthropicServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Anthropic({
      apiKey: 'mock-api-key',
      baseURL: `http://localhost:${server.address().port}/anthropic`,
    });

    const params = {
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Stream this please' }],
      stream: true,
    };

    // 1) Drain the raw `Response` body, never touching the SDK `Stream`
    const response = await client.messages.create({ ...params }).asResponse();

    // Wrapping the body must not disturb it, or `text()`, `arrayBuffer()` and `clone()` would throw
    // on a response the caller has not read yet.
    if (response.bodyUsed) {
      throw new Error('raw Response body was consumed before the caller read it');
    }

    for await (const _ of response.body) {
      void _;
    }

    // 2) Drain the SDK `Stream`, so both consumption styles are covered in one run
    const stream = await client.messages.create({ ...params });
    for await (const _ of stream) {
      void _;
    }

    // 3) Clone first, then drain. `clone()` tees the response's internal body and swaps in one branch,
    // so the wrapper has to re-read the body rather than hold on to the stream it was handed.
    const cloned = await client.messages.create({ ...params }).asResponse();
    const copy = cloned.clone();
    for await (const _ of cloned.body) {
      void _;
    }
    void copy;

    // 4) Read the body as text, which never touches the `body` property at all
    const asText = await client.messages.create({ ...params }).asResponse();
    const text = await asText.text();
    if (!text.includes('message_stop')) {
      throw new Error('raw Response text did not contain the streamed frames');
    }

    // 5) Read the body through a BYOB reader, which only a byte stream supports
    const byob = await client.messages.create({ ...params }).asResponse();
    const reader = byob.body.getReader({ mode: 'byob' });
    let buffer = new ArrayBuffer(1024);
    for (;;) {
      const { done, value } = await reader.read(new Uint8Array(buffer, 0, 1024));
      if (done) {
        break;
      }
      buffer = value.buffer;
    }
  });

  await Sentry.flush(2000);

  server.close();
}

run();
