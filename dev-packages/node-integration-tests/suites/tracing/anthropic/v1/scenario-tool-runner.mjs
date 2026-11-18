import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import { anthropicMessageStream, startMockServer, streamSseEvents } from '@sentry-internal/node-integration-tests';

const MODEL = 'claude-3-haiku-20240307';

const TOOL_USE_EVENTS = anthropicMessageStream(MODEL, {
  id: 'msg_tools',
  content: [
    { type: 'tool_use', id: 'toolu_weather', name: 'weather', input: { city: 'Vienna' } },
    { type: 'tool_use', id: 'toolu_explode', name: 'explode', input: {} },
  ],
  usage: { input_tokens: 10, output_tokens: 20 },
});
const FINAL_EVENTS = anthropicMessageStream(MODEL, {
  id: 'msg_final',
  content: 'Sunny.',
  usage: { input_tokens: 30, output_tokens: 5 },
});

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  let requests = 0;
  app.post('/anthropic/v1/messages', (_req, res) => {
    streamSseEvents(res, requests++ === 0 ? TOOL_USE_EVENTS : FINAL_EVENTS, { eventNames: true });
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

    const runner = client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 100,
      messages: [{ role: 'user', content: 'What is the weather in Vienna?' }],
      tools: [
        {
          name: 'weather',
          description: 'Get the weather by city',
          input_schema: { type: 'object', properties: { city: { type: 'string' } } },
          run: () => Sentry.startSpan({ name: 'weather lookup' }, () => 'sunny'),
        },
        {
          name: 'explode',
          description: 'Always fails',
          input_schema: { type: 'object', properties: {} },
          run: () => {
            throw new Error('Tool exploded');
          },
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
