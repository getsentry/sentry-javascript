import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.post('/anthropic/v1/messages', (req, res) => {
    res.send({
      id: 'msg-truncation-test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'This is the number **3**.' }],
      model: req.body.model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 15 },
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

async function run() {
  const server = await startMockAnthropicServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Anthropic({
      apiKey: 'mock-api-key',
      baseURL: `http://localhost:${server.address().port}/anthropic`,
    });

    // Send the image showing the number 3
    // Put the image in the last message so it doesn't get dropped
    await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: 'what number is this?',
        },
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'base64-mumbo-jumbo'.repeat(100),
              },
            },
          ],
        },
      ],
      temperature: 0.7,
    });
  });

  await Sentry.flush(2000);

  server.close();
}

run();
