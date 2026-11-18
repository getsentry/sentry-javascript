import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    const { model, stream, metadata } = req.body;
    const message = {
      id: `msg_${metadata.user_id}${stream ? '-stream' : ''}`,
      type: 'message',
      role: 'assistant',
      model,
      content: [],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    if (!stream) {
      res.send({ ...message, content: [{ type: 'text', text: 'Paris.' }] });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const events = [
      { type: 'message_start', message },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Paris.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_stop' },
    ];
    for (const event of events) {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
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
  const server = await startMockServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Anthropic({
      apiKey: 'mock-api-key',
      baseURL: `http://localhost:${server.address().port}/anthropic`,
    });
    const request = userId => ({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
      metadata: { user_id: userId },
    });

    await Sentry.withScope(async scope => {
      scope.setTag('privacy', 'public');
      await client.messages.create(request('public'));
    });

    await Sentry.withScope(async scope => {
      scope.setTag('privacy', 'private');
      await client.messages.create(request('private'));

      // Changing the tag after the call started must not change its outputs decision.
      const stream = await client.messages.create({ ...request('public'), stream: true });
      Sentry.getCurrentScope().setTag('privacy', 'public');
      for await (const event of stream) {
        void event;
      }
    });
  });

  server.close();
}

run();
