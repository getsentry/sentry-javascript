import express from 'express';
import * as Sentry from '@sentry/node';
import { z } from 'zod';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { Observability } from '@mastra/observability';
import { SentryMastraExporter } from '@sentry/node';
import DataLoader from 'dataloader';

// Two-step agent loop whose tool uses the orchestrion-instrumented `dataloader`. The exporter opens the
// `execute_tool` span; the Mastra integration's `executeWithContext` binding makes it active while the
// tool runs, so `dataloader.load`'s `cache.get` span nests under it — no manual span in the tool.
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
        function: { name: 'count_items', arguments: '{"names":["apple","banana"]}' },
      },
    ],
    usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
  },
  {
    id: 'chatcmpl-final',
    content: 'apple has 5 letters, banana has 6.',
    usage: { prompt_tokens: 30, completion_tokens: 8, total_tokens: 38 },
  },
]);

async function run() {
  const agent = new Agent({
    id: 'counter_agent',
    name: 'counter_agent',
    instructions: 'Use the count_items tool.',
    model: { id: 'openai/gpt-4o-mini', url: provider.url, apiKey: 'test' },
    tools: {
      count_items: createTool({
        id: 'count_items',
        description: 'Count the letters in each name',
        inputSchema: z.object({ names: z.array(z.string()) }),
        execute: async ({ names }) => {
          const loader = new DataLoader(async keys => keys.map(key => key.length));
          const counts = await Promise.all(names.map(name => loader.load(name)));
          return { counts };
        },
      }),
    },
  });

  const mastra = new Mastra({
    agents: { counter_agent: agent },
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
    await mastra.getAgent('counter_agent').generate('Count the letters in apple and banana.', { maxSteps: 3 });
  });

  await mastra.observability.shutdown();
  provider.close();
}

run();
