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

async function run() {
  const server = await startMockAnthropicServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Anthropic({
      apiKey: 'mock-api-key',
      baseURL: `${server.url}/anthropic`,
    });

    // 1) Streaming via stream: true param on messages.create
    const stream1 = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Stream this please' }],
      stream: true,
    });
    for await (const _ of stream1) {
      void _;
    }

    // 2) Streaming via messages.stream API
    const stream2 = client.messages.stream({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Stream this too' }],
    });
    for await (const _ of stream2) {
      void _;
    }

    // 3) Streaming via messages.stream API with redundant stream: true param
    const stream3 = client.messages.stream({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Stream with param' }],
      stream: true, // This param is redundant but should not break synchronous behavior
    });
    // Verify it has .on() method immediately (not a Promise)
    if (typeof stream3.on !== 'function') {
      throw new Error('BUG: messages.stream() with stream: true did not return MessageStream synchronously!');
    }
    for await (const _ of stream3) {
      void _;
    }
  });

  await Sentry.flush(2000);

  server.close();
}

run();
