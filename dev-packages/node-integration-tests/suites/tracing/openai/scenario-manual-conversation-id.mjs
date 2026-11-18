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

  // Test: Multiple chat completions in the same conversation with manual conversation ID
  await Sentry.startSpan({ op: 'function', name: 'chat-with-manual-conversation-id' }, async () => {
    const client = new OpenAI({
      baseURL: `${server.url}/openai`,
      apiKey: 'mock-api-key',
    });

    // Set conversation ID manually using Sentry API
    Sentry.setConversationId('user_chat_session_abc123');

    // First message in the conversation
    await client.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
    });

    // Second message in the same conversation
    await client.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Tell me more about it' }],
    });

    // Third message in the same conversation
    await client.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'What is its population?' }],
    });
  });

  server.close();
  await Sentry.flush(2000);
}

run();
