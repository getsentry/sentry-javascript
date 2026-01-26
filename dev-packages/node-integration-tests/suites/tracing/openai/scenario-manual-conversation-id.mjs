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

  // Test: Multiple chat completions in the same conversation with manual conversation ID
  await Sentry.startSpan({ op: 'function', name: 'chat-with-manual-conversation-id' }, async () => {
    const client = new OpenAI({
      baseURL: `http://localhost:${server.address().port}/openai`,
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
