import { ChatAnthropic } from '@langchain/anthropic';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    const model = req.body.model;

    res.json({
      id: 'msg_truncation_test',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Response to truncated messages',
        },
      ],
      model: model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 15,
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
  const server = await startMockAnthropicServer();
  const baseUrl = `http://localhost:${server.address().port}`;

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const model = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20241022',
      apiKey: 'mock-api-key',
      clientOptions: {
        baseURL: baseUrl,
      },
    });

    const largeContent1 = 'A'.repeat(15000); // ~15KB
    const largeContent2 = 'B'.repeat(15000); // ~15KB
    const largeContent3 = 'C'.repeat(25000) + 'D'.repeat(25000); // ~50KB (will be truncated, only C's remain)

    // Test 1: Create one very large string that gets truncated to only include Cs
    await model.invoke(largeContent3);

    // Test 2: Create an array of messages that gets truncated to only include the last message
    // The last message should be truncated to fit within the 20KB limit (result should again contain only Cs)
    await model.invoke([
      { role: 'system', content: largeContent1 },
      { role: 'user', content: largeContent2 },
      { role: 'user', content: largeContent3 },
    ]);

    // Test 3: Given an array of messages only the last message should be kept
    // The last message is small, so it should be kept intact
    const smallContent = 'This is a small message that fits within the limit';
    await model.invoke([
      { role: 'system', content: largeContent1 },
      { role: 'user', content: largeContent2 },
      { role: 'user', content: smallContent },
    ]);
  });

  await Sentry.flush(2000);

  server.close();
}

run();
