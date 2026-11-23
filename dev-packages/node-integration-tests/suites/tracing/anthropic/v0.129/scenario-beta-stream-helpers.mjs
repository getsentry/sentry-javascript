import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import { anthropicMessageStream, startMockServer, streamSseEvents } from '@sentry-internal/node-integration-tests';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    const model = req.body.model;
    // The response id names the caller, so the test can find the span for each helper.
    const id = `msg_${req.body.messages[0].content}`;
    const events = anthropicMessageStream(model, { id });
    streamSseEvents(res, events, { eventNames: true });
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

    await client.beta.messages
      .stream({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'beta_stream' }],
      })
      .finalMessage();

    // With `runToolsEagerly`, the runner calls `beta.messages.create()` directly and not through
    // `beta.messages.stream()`, but it still sends the stream helper header.
    const runner = client.beta.messages.toolRunner({
      model: 'claude-3-haiku-20240307',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'tool_runner_eager' }],
      tools: [
        {
          name: 'weather',
          description: 'Get the weather by city',
          input_schema: { type: 'object', properties: { city: { type: 'string' } } },
          run: () => 'sunny',
        },
      ],
      stream: true,
      runToolsEagerly: true,
    });
    for await (const stream of runner) {
      await stream.finalMessage();
    }
  });

  await Sentry.flush(2000);

  server.close();
}

run();
