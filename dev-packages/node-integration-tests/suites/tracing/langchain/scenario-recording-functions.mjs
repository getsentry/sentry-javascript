import { ChatAnthropic } from '@langchain/anthropic';
import * as Sentry from '@sentry/node';
import { anthropicMessage, startMockServer } from '@sentry-internal/node-integration-tests';
import express from 'express';

let scopeToFlip;

function startMockAnthropicApi() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    const prompt = req.body.messages[0].content;
    // Flips the caller's tag between the start and end callbacks of the private call.
    if (prompt === 'private') {
      scopeToFlip.setTag('privacy', 'public');
    }

    res.json(anthropicMessage(req.body.model, { id: `msg_${prompt}`, content: 'Paris.' }));
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockAnthropicApi();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const model = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20241022',
      apiKey: 'mock-api-key',
      clientOptions: { baseURL: server.url },
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
