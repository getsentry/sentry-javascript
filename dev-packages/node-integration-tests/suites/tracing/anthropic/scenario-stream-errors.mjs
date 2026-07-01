import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    const model = req.body.model;

    // Fail before any streaming begins.
    if (model === 'error-stream-init') {
      res
        .status(400)
        .set('x-request-id', 'mock-stream-init-error')
        .send({ type: 'error', error: { type: 'invalid_request_error', message: 'Failed to initialize stream' } });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Start a valid stream, then drop the connection mid-message (no message_stop).
    if (model === 'error-stream-midway') {
      const events = [
        {
          type: 'message_start',
          message: {
            id: 'msg_error_stream_1',
            type: 'message',
            role: 'assistant',
            model,
            content: [],
            usage: { input_tokens: 5 },
          },
        },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'This stream will ' } },
      ];
      events.forEach((event, index) => {
        setTimeout(() => {
          res.write(`event: ${event.type}\n`);
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }, index * 10);
      });
      // Drop the connection only after the last event has been received and parsed, so the streamed
      // text is captured before the stream errors out.
      setTimeout(() => res.destroy(), events.length * 10 + 50);
      return;
    }

    res.end();
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

    // 1) Error on stream initialization with messages.create
    try {
      const stream = await client.messages.create({
        model: 'error-stream-init',
        messages: [{ role: 'user', content: 'This will fail immediately' }],
        stream: true,
      });
      for await (const _ of stream) {
        void _;
      }
    } catch {
      // Error expected
    }

    // 2) Error on stream initialization with messages.stream
    try {
      const stream = client.messages.stream({
        model: 'error-stream-init',
        messages: [{ role: 'user', content: 'This will also fail immediately' }],
      });
      for await (const _ of stream) {
        void _;
      }
    } catch {
      // Error expected
    }

    // 3) Error midway through streaming with messages.create
    try {
      const stream = await client.messages.create({
        model: 'error-stream-midway',
        messages: [{ role: 'user', content: 'This will fail midway' }],
        stream: true,
      });
      for await (const _ of stream) {
        void _;
      }
    } catch {
      // Error expected
    }

    // 4) Error midway through streaming with messages.stream
    try {
      const stream = client.messages.stream({
        model: 'error-stream-midway',
        messages: [{ role: 'user', content: 'This will also fail midway' }],
      });
      for await (const _ of stream) {
        void _;
      }
    } catch {
      // Error expected
    }
  });

  await Sentry.flush(2000);

  server.close();
}

run();
