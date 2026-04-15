import { ChatAnthropic } from '@langchain/anthropic';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.post('/v1/messages', (req, res) => {
    res.json({
      id: 'msg_no_truncation_test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Response' }],
      model: req.body.model,
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
  const baseUrl = `http://localhost:${server.address().port}`;

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const model = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20241022',
      apiKey: 'mock-api-key',
      clientOptions: {
        baseURL: baseUrl,
      },
    });

    // Single long message so truncation must crop it
    const longContent = 'A'.repeat(50_000);
    await model.invoke([{ role: 'user', content: longContent }]);
  });

  await Sentry.flush(2000);

  server.close();
}

run();
