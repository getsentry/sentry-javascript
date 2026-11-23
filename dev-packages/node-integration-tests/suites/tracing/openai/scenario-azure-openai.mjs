import express from 'express';
import { AzureOpenAI } from 'openai';
import { openAiChatCompletion, startMockServer } from '@sentry-internal/node-integration-tests';

function startMockOpenAiServer() {
  const app = express();
  app.use(express.json());

  app.post('/azureopenai/deployments/:model/chat/completions', (req, res) => {
    res.send(openAiChatCompletion(req.body.model));
  });
  return startMockServer(app);
}

async function run() {
  const server = await startMockOpenAiServer();

  const client = new AzureOpenAI({
    baseURL: `${server.url}/azureopenai`,
    apiKey: 'mock-api-key',
    apiVersion: '2024-02-15-preview',
  });

  const response = await client.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is the capital of France?' },
    ],
    temperature: 0.7,
    max_tokens: 100,
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(response));

  server.close();
}

run();
