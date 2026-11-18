import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import { anthropicMessage, startMockServer } from '@sentry-internal/node-integration-tests';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    res.send(
      anthropicMessage(req.body.model, {
        id: 'msg_system_test',
        content: 'Response',
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );
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

    await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: 'You are a helpful assistant',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  server.close();
}

run();
