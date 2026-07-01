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
      content: [{ type: 'text', text: 'Response to truncated messages' }],
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

    // Test 1: Given an array of messages only the last message should be kept
    // The last message should be truncated to fit within the 20KB limit
    const largeContent1 = 'A'.repeat(15000); // ~15KB
    const largeContent2 = 'B'.repeat(15000); // ~15KB
    const largeContent3 = 'C'.repeat(25000) + 'D'.repeat(25000); // ~50KB (will be truncated, only C's remain)

    await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [
        { role: 'user', content: largeContent1 },
        { role: 'assistant', content: largeContent2 },
        { role: 'user', content: largeContent3 },
      ],
      temperature: 0.7,
    });

    // Test 2: Given an array of messages only the last message should be kept
    // The last message is small, so it should be kept intact
    const smallContent = 'This is a small message that fits within the limit';
    await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [
        { role: 'user', content: largeContent1 },
        { role: 'assistant', content: largeContent2 },
        { role: 'user', content: smallContent },
      ],
      temperature: 0.7,
    });
  });

  await Sentry.flush(2000);

  server.close();
}

run();
