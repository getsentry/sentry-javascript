import * as Sentry from '@sentry/node';
import express from 'express';
import OpenAI from 'openai';
import { openAiChatCompletion, startMockServer } from '@sentry-internal/node-integration-tests';

function startMockApi() {
  const app = express();
  app.use(express.json());

  app.post('/openai/chat/completions', (req, res) => {
    const { model } = req.body;

    res.send(
      openAiChatCompletion(model, {
        id: 'chatcmpl-system-test',
        content: 'Response',
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    );
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockApi();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new OpenAI({
      baseURL: `${server.url}/openai`,
      apiKey: 'test-key',
    });

    await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
      ],
    });
  });

  server.close();
}

run();
