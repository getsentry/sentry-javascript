import { ChatAnthropic } from '@langchain/anthropic';
import * as Sentry from '@sentry/node';
import express from 'express';

let scopeToFlip;

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    const prompt = req.body.messages[0].content;
    // Flips the caller's tag between the start and end callbacks of the private call.
    if (prompt === 'private') {
      scopeToFlip.setTag('privacy', 'public');
    }

    res.json({
      id: `msg_${prompt}`,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Paris.' }],
      model: req.body.model,
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 15 },
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function run() {
  const server = await startMockAnthropicServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const model = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20241022',
      apiKey: 'mock-api-key',
      clientOptions: { baseURL: `http://localhost:${server.address().port}` },
    });

    for (const privacy of ['public', 'private']) {
      await Sentry.withScope(async scope => {
        scope.setTag('privacy', privacy);
        scopeToFlip = scope;
        await model.invoke(privacy, { metadata: { privacy } });
      });
    }
  });

  await Sentry.flush(2000);
  server.close();
}

run();
