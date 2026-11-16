import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    // Never respond, so the caller aborts before the response arrives.
    if (req.body.model === 'abort-before-response') {
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Send part of a message and keep the connection open, so the caller aborts mid-stream.
    const events = [
      {
        type: 'message_start',
        message: {
          id: 'msg_abort_midway_1',
          type: 'message',
          role: 'assistant',
          model: req.body.model,
          content: [],
          usage: { input_tokens: 5 },
        },
      },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'This stream will ' } },
    ];
    for (const event of events) {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
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

    // 1) Abort before the response arrives
    const beforeResponse = client.messages.stream({
      model: 'abort-before-response',
      messages: [{ role: 'user', content: 'This will be aborted before the response' }],
    });
    setTimeout(() => beforeResponse.abort(), 50);
    try {
      await beforeResponse.done();
    } catch {
      // Abort expected
    }

    // 2) Abort midway through streaming
    const midway = client.messages.stream({
      model: 'abort-midway',
      messages: [{ role: 'user', content: 'This will be aborted midway' }],
    });
    midway.on('text', () => midway.abort());
    try {
      await midway.done();
    } catch {
      // Abort expected
    }
  });

  await Sentry.flush(2000);

  server.closeAllConnections();
  server.close();
}

run();
