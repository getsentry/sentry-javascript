import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import { anthropicMessageStream, startMockServer, streamSseEvents } from '@sentry-internal/node-integration-tests';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    const model = req.body.model;
    const events = anthropicMessageStream(model);
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

    // The stream helper delegates to `messages.create({ stream: true })` underneath.
    await client.messages
      .stream({
        model: 'claude-3-haiku-20240307',
        messages: [{ role: 'user', content: 'Stream this please' }],
      })
      .finalMessage();
  });

  await Sentry.flush(2000);

  server.close();
}

run();
