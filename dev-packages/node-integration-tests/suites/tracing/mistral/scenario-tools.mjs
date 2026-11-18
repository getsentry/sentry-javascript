import { Mistral } from '@mistralai/mistralai';
import * as Sentry from '@sentry/node';
import express from 'express';
import { openAiChatCompletion, startMockServer, streamSseEvents } from '@sentry-internal/node-integration-tests';

const weatherTool = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get the current weather for a city',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    },
  },
};

function startMockApi() {
  const app = express();
  app.use(express.json());

  app.post('/v1/chat/completions', (req, res) => {
    const { model, stream } = req.body;

    if (stream) {
      // Tool call streamed across chunks — the argument string arrives fragmented.
      const toolCall = frag => [
        { index: 0, id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: frag } },
      ];
      const chunks = [
        {
          id: 'chatcmpl-tools-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model,
          choices: [{ index: 0, delta: { role: 'assistant', tool_calls: toolCall('') }, finish_reason: null }],
        },
        {
          id: 'chatcmpl-tools-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model,
          choices: [{ index: 0, delta: { tool_calls: toolCall('{"city":') }, finish_reason: null }],
        },
        {
          id: 'chatcmpl-tools-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model,
          choices: [{ index: 0, delta: { tool_calls: toolCall('"Paris"}') }, finish_reason: null }],
        },
        {
          id: 'chatcmpl-tools-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
          usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
        },
      ];

      streamSseEvents(res, chunks, { done: true });
    } else {
      res.send(
        openAiChatCompletion(model, {
          id: 'chatcmpl-tools-123',
          content: '',
          toolCalls: [
            { id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 8 },
        }),
      );
    }
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockApi();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Mistral({
      apiKey: 'mock-api-key',
      serverURL: server.url,
    });

    await client.chat.complete({
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: 'What is the weather in Paris?' }],
      tools: [weatherTool],
    });

    const stream = await client.chat.stream({
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: 'What is the weather in Paris?' }],
      tools: [weatherTool],
    });

    for await (const event of stream) {
      void event;
    }
  });

  await Sentry.flush(2000);
  server.close();
}

run();
