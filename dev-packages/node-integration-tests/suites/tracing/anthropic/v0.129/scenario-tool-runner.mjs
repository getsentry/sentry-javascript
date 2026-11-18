import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import { startMockServer, streamSseEvents } from '@sentry-internal/node-integration-tests';

const MODEL = 'claude-3-haiku-20240307';

function toolUseEvents() {
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_tools',
        type: 'message',
        role: 'assistant',
        model: MODEL,
        content: [],
        usage: { input_tokens: 10 },
      },
    },
  ];
  [
    { id: 'toolu_weather', name: 'weather', input: { city: 'Vienna' } },
    { id: 'toolu_explode', name: 'explode', input: {} },
  ].forEach((call, index) => {
    events.push(
      {
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: call.id, name: call.name, input: {} },
      },
      {
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.input) },
      },
      { type: 'content_block_stop', index },
    );
  });
  events.push(
    { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 20 } },
    { type: 'message_stop' },
  );
  return events;
}

function finalEvents() {
  return [
    {
      type: 'message_start',
      message: {
        id: 'msg_final',
        type: 'message',
        role: 'assistant',
        model: MODEL,
        content: [],
        usage: { input_tokens: 30 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Sunny.' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
}

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  let requests = 0;
  app.post('/anthropic/v1/messages', (_req, res) => {
    const events = requests++ === 0 ? toolUseEvents() : finalEvents();
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

    const runner = client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 100,
      messages: [{ role: 'user', content: 'What is the weather in Vienna?' }],
      tools: [
        {
          name: 'weather',
          description: 'Get the weather by city',
          input_schema: { type: 'object', properties: { city: { type: 'string' } } },
          run: () => 'sunny',
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
