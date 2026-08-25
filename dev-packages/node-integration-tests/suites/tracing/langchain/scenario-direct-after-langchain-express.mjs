import Anthropic from '@anthropic-ai/sdk';
import { ChatAnthropic } from '@langchain/anthropic';
import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    res.json({
      id: 'msg_test123',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Mock response from Anthropic!' }],
      model: req.body.model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 15 },
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

// No top-level await: the scenario also runs transpiled to CJS.
startMockAnthropicServer().then(mockServer => {
  const baseURL = `http://localhost:${mockServer.address().port}`;

  const app = express();

  app.get('/langchain', async (_req, res) => {
    const model = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20241022',
      apiKey: 'mock-api-key',
      clientOptions: { baseURL },
    });
    await model.invoke('LangChain Anthropic call');
    res.send({ message: 'OK' });
  });

  app.get('/direct', async (_req, res) => {
    const client = new Anthropic({ apiKey: 'mock-api-key', baseURL });
    await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'Direct Anthropic call' }],
      max_tokens: 100,
    });
    res.send({ message: 'OK' });
  });

  Sentry.setupExpressErrorHandler(app);

  startExpressServerAndSendPortToRunner(app);
});
