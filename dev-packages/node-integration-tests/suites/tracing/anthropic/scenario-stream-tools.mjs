import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import { anthropicMessageStream, startMockServer, streamSseEvents } from '@sentry-internal/node-integration-tests';

const TOOLS = [
  {
    name: 'weather',
    description: 'Get weather',
    input_schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
  },
];

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    const model = req.body.model;
    const events = anthropicMessageStream(model, {
      id: 'msg_stream_tool_1',
      content: [
        { type: 'text', text: 'Starting tool...' },
        { type: 'tool_use', id: 'tool_weather_2', name: 'weather', input: { city: 'Paris' } },
      ],
      usage: { input_tokens: 11, output_tokens: 9 },
    });

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

    // 1) Streaming tool call via stream: true param on messages.create
    const stream1 = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Need the weather' }],
      tools: TOOLS,
      stream: true,
    });
    for await (const _ of stream1) {
      void _;
    }

    // 2) Streaming tool call via messages.stream API
    const stream2 = client.messages.stream({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Need the weather' }],
      tools: TOOLS,
    });
    for await (const _ of stream2) {
      void _;
    }
  });

  await Sentry.flush(2000);

  server.close();
}

run();
