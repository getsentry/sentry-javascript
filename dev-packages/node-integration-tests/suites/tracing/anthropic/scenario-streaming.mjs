import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.post('/anthropic/v1/messages', (req, res) => {
    res.send({
      id: 'msg_streaming_test',
      type: 'message',
      model: req.body.model,
      role: 'assistant',
      content: [{ type: 'text', text: 'Response' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
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

    // Long content that would normally be truncated
    const longContent = 'A'.repeat(50_000);
    await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [{ role: 'user', content: longContent }],
    });
  });

  // Flush is required when span streaming is enabled to ensure streamed spans are sent before the process exits
  await Sentry.flush(2000);

  server.close();
}

run();
