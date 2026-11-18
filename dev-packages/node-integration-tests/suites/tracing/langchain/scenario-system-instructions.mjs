import { ChatAnthropic } from '@langchain/anthropic';
import * as Sentry from '@sentry/node';
import express from 'express';
import { anthropicMessage, startMockServer } from '@sentry-internal/node-integration-tests';

function startMockApi() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    res.json(
      anthropicMessage(req.body.model, {
        id: 'msg_test123',
        content: 'Response',
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockApi();
  const baseUrl = server.url;

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const model = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20241022',
      apiKey: 'mock-api-key',
      clientOptions: {
        baseURL: baseUrl,
      },
    });

    await model.invoke([
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello' },
    ]);
  });

  await Sentry.flush(2000);

  server.close();
}

run();
