import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import { startMockServer } from '@sentry-internal/node-integration-tests';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  // Anthropic can hand back an error-shaped body on an otherwise successful (HTTP 200) response.
  // The SDK resolves it as data, so the caller never sees a thrown error.
  // @see https://docs.anthropic.com/en/api/errors#error-shapes
  app.post('/anthropic/v1/messages', (_req, res) => {
    res
      .status(200)
      .set('x-request-id', 'mock-response-error')
      .json({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
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

    // Resolves with the error-shaped body; no try/catch because nothing is thrown.
    await client.messages.create({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
      max_tokens: 100,
    });
  });

  await Sentry.flush(2000);
  server.close();
}

run();
