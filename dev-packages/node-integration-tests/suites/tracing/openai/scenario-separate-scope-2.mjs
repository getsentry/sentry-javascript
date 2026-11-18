import * as Sentry from '@sentry/node';
import express from 'express';
import OpenAI from 'openai';
import { openAiChatCompletion, startMockServer } from '@sentry-internal/node-integration-tests';

function startMockApi() {
  const app = express();
  app.use(express.json());

  // Chat completions endpoint
  app.post('/openai/chat/completions', (req, res) => {
    const { model } = req.body;

    res.send(openAiChatCompletion(model, { content: 'Mock response from OpenAI' }));
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockApi();
  const client = new OpenAI({
    baseURL: `${server.url}/openai`,
    apiKey: 'mock-api-key',
  });

  // Second request/conversation scope (completely separate)
  await Sentry.withScope(async scope => {
    // Set different conversation ID for this request scope BEFORE starting the span
    scope.setConversationId('conv_user2_session_xyz');

    await Sentry.startSpan({ op: 'http.server', name: 'GET /chat/conversation-2' }, async () => {
      // First message in conversation 2
      await client.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello from conversation 2' }],
      });

      // Second message in conversation 2
      await client.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Follow-up in conversation 2' }],
      });
    });
  });

  server.close();
  await Sentry.flush(2000);
}

run();
