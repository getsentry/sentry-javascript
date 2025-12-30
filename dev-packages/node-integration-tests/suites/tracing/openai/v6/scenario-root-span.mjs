import express from 'express';
import OpenAI from 'openai';

function startMockOpenAiServer() {
  const app = express();
  app.use(express.json());

  app.post('/openai/chat/completions', (req, res) => {
    res.send({
      id: 'chatcmpl-mock123',
      object: 'chat.completion',
      created: 1677652288,
      model: req.body.model,
      system_fingerprint: 'fp_44709d6fcb',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello from OpenAI mock!',
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
  const server = await startMockOpenAiServer();

  const client = new OpenAI({
    baseURL: `http://localhost:${server.address().port}/openai`,
    apiKey: 'mock-api-key',
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
