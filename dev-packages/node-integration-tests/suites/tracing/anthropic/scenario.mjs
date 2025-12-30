import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages/count_tokens', (req, res) => {
    res.send({
      input_tokens: 15,
    });
  });

  app.get('/anthropic/v1/models/:model', (req, res) => {
    res.send({
      id: req.params.model,
      name: req.params.model,
      created_at: 1715145600,
      model: req.params.model,
    });
  });

  app.post('/anthropic/v1/messages', (req, res) => {
    const model = req.body.model;

    if (model === 'error-model') {
      res.status(404).set('x-request-id', 'mock-request-123').send('Model not found');
      return;
    }

    // Check if streaming is requested
    if (req.body.stream === true) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      // Send streaming events
      const events = [
        {
          type: 'message_start',
          message: {
            id: 'msg_stream123',
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
        }, index * 10); // Small delay between events
      });

      return;
    }

    // Non-streaming response
    res.send({
      id: 'msg_mock123',
      type: 'message',
      model,
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Hello from Anthropic mock!',
        },
      ],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 15,
      },
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

    // First test: basic message completion
    await client.messages.create({
      model: 'claude-3-haiku-20240307',
      system: 'You are a helpful assistant.',
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
      temperature: 0.7,
      max_tokens: 100,
    });

    // Second test: error handling
    try {
      await client.messages.create({
        model: 'error-model',
        messages: [{ role: 'user', content: 'This will fail' }],
      });
    } catch {
      // Error is expected and handled
    }

    // Third test: count tokens with cached tokens
    await client.messages.countTokens({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
    });

    // Fourth test: models.retrieve
    await client.models.retrieve('claude-3-haiku-20240307');

    // Fifth test: streaming via messages.create
    const stream = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
      stream: true,
    });

    for await (const _ of stream) {
      void _;
    }

    // Sixth test: streaming via messages.stream
    await client.messages
      .stream({
        model: 'claude-3-haiku-20240307',
        messages: [{ role: 'user', content: 'What is the capital of France?' }],
      })
      .on('streamEvent', () => {
        Sentry.captureMessage('stream event from user-added event listener captured');
      });
  });

  // Wait for the stream event handler to finish
  await Sentry.flush(2000);

  server.close();
}

run();
