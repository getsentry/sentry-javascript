import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import {
  anthropicMessage,
  anthropicMessageStream,
  startMockServer,
  streamSseEvents,
} from '@sentry-internal/node-integration-tests';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    const model = req.body.model;

    if (model === 'error-model') {
      res.status(404).set('x-request-id', 'mock-request-123').send('Model not found');
      return;
    }

    // Check if streaming is requested
    if (req.body.stream === true) {
      // Send streaming events
      const events = anthropicMessageStream(model, { id: 'msg_stream123', content: 'Hello from stream!' });

      streamSseEvents(res, events, { eventNames: true });

      return;
    }

    // Non-streaming response
    res.send(anthropicMessage(model));
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

    // Third test: streaming via messages.create
    const stream = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
      stream: true,
    });

    for await (const _ of stream) {
      void _;
    }

    // Fourth test: streaming via messages.stream
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
