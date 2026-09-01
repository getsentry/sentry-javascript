import express from 'express';
import * as Sentry from '@sentry/node';
import { z } from 'zod';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { Observability } from '@mastra/observability';
import { SentryMastraExporter } from '@sentry/node';

// Two-step agent loop. Inlined OpenAI-compatible mock: the ESM/CJS runner copies only this file.
function startMockProvider(responses) {
  const app = express();
  app.use(express.json());

  let call = 0;
  app.post('/v1/chat/completions', (req, res) => {
    const response = responses[Math.min(call, responses.length - 1)];
    call++;
    res.json({
      id: response.id,
      object: 'chat.completion',
      created: 1,
      model: req.body.model,
      choices: [
        {
          index: 0,
          finish_reason: response.toolCalls ? 'tool_calls' : 'stop',
          message: {
            role: 'assistant',
            content: response.content ?? null,
            ...(response.toolCalls ? { tool_calls: response.toolCalls } : {}),
          },
        },
      ],
      usage: response.usage,
    });
  });

  const server = app.listen(0);
  return {
    url: `http://localhost:${server.address().port}/v1`,
    close: () => server.close(),
  };
}

const provider = startMockProvider([
  {
    id: 'chatcmpl-tool',
    toolCalls: [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"city":"Berlin"}' },
      },
    ],
    usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
  },
  {
    id: 'chatcmpl-final',
    content: 'It is 22C in Berlin.',
    usage: { prompt_tokens: 30, completion_tokens: 8, total_tokens: 38 },
  },
]);

async function run() {
  const agent = new Agent({
    id: 'weather_agent',
    name: 'weather_agent',
    instructions: 'Use the weather tool.',
    model: { id: 'openai/gpt-4o-mini', url: provider.url, apiKey: 'test' },
    tools: {
      get_weather: createTool({
        id: 'get_weather',
        description: 'Get weather for a city',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => ({ temperature: 22, city }),
      }),
    },
  });

  const mastra = new Mastra({
    agents: { weather_agent: agent },
    logger: false,
    observability: new Observability({
      configs: {
        default: {
          serviceName: 'mastra-test',
          exporters: [new SentryMastraExporter()],
        },
      },
    }),
  });

  await Sentry.startSpan({ op: 'function', name: 'mastra-test' }, async () => {
    await mastra.getAgent('weather_agent').generate('Weather in Berlin?', { maxSteps: 3 });
  });

  await mastra.observability.shutdown();
  await Sentry.flush(2000);
  provider.close();
}

run();
