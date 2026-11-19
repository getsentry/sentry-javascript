import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import {
  anthropicMessage,
  anthropicMessageStream,
  startMockServer,
  streamSseEvents,
} from '@sentry-internal/node-integration-tests';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    const { model, stream, metadata } = req.body;
    const options = { id: `msg_${metadata.user_id}${stream ? '-stream' : ''}`, content: 'Paris.' };

    if (stream) {
      streamSseEvents(res, anthropicMessageStream(model, options), { eventNames: true });
    } else {
      res.send(anthropicMessage(model, options));
    }
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockAnthropicServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Anthropic({
      apiKey: 'mock-api-key',
      baseURL: `${server.url}/anthropic`,
    });
    const request = userId => ({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
      metadata: { user_id: userId },
    });

    await Sentry.withScope(async scope => {
      scope.setTag('privacy', 'public');
      await client.messages.create(request('public'));
    });

    await Sentry.withScope(async scope => {
      scope.setTag('privacy', 'private');
      await client.messages.create(request('private'));

      // Changing the tag after the call started must not change its outputs decision.
      const stream = await client.messages.create({ ...request('public'), stream: true });
      Sentry.getCurrentScope().setTag('privacy', 'public');
      for await (const event of stream) {
        void event;
      }
    });
  });

  server.close();
}

run();
