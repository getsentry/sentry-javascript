import * as Sentry from '@sentry/node';
import express from 'express';
import OpenAI from 'openai';

function startMockServer() {
  const app = express();
  app.use(express.json());

  // Chat completions endpoint
  app.post('/openai/chat/completions', (req, res) => {
    const { model } = req.body;

    res.send({
      id: 'chatcmpl-mock123',
      object: 'chat.completion',
      created: 1677652288,
      model: model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Mock response from OpenAI',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25,
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
  const server = await startMockServer();
  const client = new OpenAI({
    baseURL: `http://localhost:${server.address().port}/openai`,
    apiKey: 'mock-api-key',
  });

  // First request/conversation scope
  await Sentry.withScope(async scope => {
    // Set conversation ID for this request scope BEFORE starting the span
    scope.setConversationId('conv_user1_session_abc');

    await Sentry.startSpan({ op: 'http.server', name: 'GET /chat/conversation-1' }, async () => {
      // First message in conversation 1
      await client.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello from conversation 1' }],
      });

      // Second message in conversation 1
      await client.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Follow-up in conversation 1' }],
      });
    });
  });

  server.close();
  await Sentry.flush(2000);
}

run();
