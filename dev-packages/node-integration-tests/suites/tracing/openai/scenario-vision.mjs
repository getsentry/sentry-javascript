import * as Sentry from '@sentry/node';
import express from 'express';
import OpenAI from 'openai';

function startMockServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.post('/openai/chat/completions', (req, res) => {
    res.send({
      id: 'chatcmpl-vision-123',
      object: 'chat.completion',
      created: 1677652288,
      model: req.body.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'I see a red square in the image.',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 50,
        completion_tokens: 10,
        total_tokens: 60,
      },
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

// Small 10x10 red PNG image encoded as base64
const RED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

async function run() {
  const server = await startMockServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new OpenAI({
      baseURL: `http://localhost:${server.address().port}/openai`,
      apiKey: 'mock-api-key',
    });

    // Vision request with inline base64 image
    await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${RED_PNG_BASE64}`,
              },
            },
          ],
        },
      ],
    });

    // Vision request with multiple images (one inline, one URL)
    await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Compare these images' },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${RED_PNG_BASE64}`,
              },
            },
            {
              type: 'image_url',
              image_url: {
                url: 'https://example.com/image.png',
              },
            },
          ],
        },
      ],
    });
  });

  server.close();
}

run();
