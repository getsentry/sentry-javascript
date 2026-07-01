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

    const events = [
      {
        type: 'message_start',
        message: {
          id: 'msg_stream123',
          type: 'message',
          role: 'assistant',
          model: req.body.model,
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

async function run() {
  const server = await startMockAnthropicServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Anthropic({
      apiKey: 'mock-api-key',
      baseURL: `http://localhost:${server.address().port}/anthropic`,
    });

    const stream = client.messages.stream({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
    });

    // Await completion so the deferred span ends before the parent span closes.
    await new Promise((resolve, reject) => {
      stream.on('end', resolve).on('error', reject);
    });
  });

  await Sentry.flush(2000);
  server.close();
}

run();
