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
    // The prompt names the response id, so each call's span can be told apart.
    const id = req.body.messages[0].content;

    if (!req.body.stream) {
      res.json(anthropicMessage(req.body.model, { id, content: 'Hello!' }));
      return;
    }

    streamSseEvents(res, anthropicMessageStream(req.body.model, { id }), { eventNames: true });
  });

  app.post('/anthropic/v1/complete', (req, res) => {
    res.json({
      id: req.body.prompt.includes('asResponse') ? 'compl_v0_as_response' : 'compl_v0',
      type: 'completion',
      model: req.body.model,
      completion: 'Hello!',
      stop_reason: 'stop_sequence',
    });
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
    const model = 'claude-3-haiku-20240307';

    await client.messages.create({ model, max_tokens: 100, messages: [{ role: 'user', content: 'msg_v0_create' }] });
    await client.beta.messages.create({
      model,
      max_tokens: 100,
      messages: [{ role: 'user', content: 'msg_v0_beta_create' }],
    });

    const stream = await client.messages.create({
      model,
      max_tokens: 100,
      stream: true,
      messages: [{ role: 'user', content: 'msg_v0_stream' }],
    });
    for await (const _ of stream) {
      // consume
    }

    await client.messages
      .stream({ model, max_tokens: 100, messages: [{ role: 'user', content: 'msg_v0_stream_helper' }] })
      .finalMessage();

    await client.completions.create({
      model: 'claude-2',
      max_tokens_to_sample: 100,
      prompt: '\n\nHuman: Hello\n\nAssistant:',
    });
    const response = await client.completions
      .create({ model: 'claude-2', max_tokens_to_sample: 100, prompt: '\n\nHuman: asResponse\n\nAssistant:' })
      .asResponse();
    await response.json();
  });

  await Sentry.flush(2000);

  server.close();
}

run();
