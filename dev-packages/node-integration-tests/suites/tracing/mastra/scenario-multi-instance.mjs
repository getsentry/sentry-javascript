import express from 'express';
import * as Sentry from '@sentry/node';
import { z } from 'zod';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { Observability } from '@mastra/observability';
import { SentryMastraExporter } from '@sentry/node';
import DataLoader from 'dataloader';

// Two independent `Mastra` instances (each with its own exporter) run concurrently. The span registry
// is keyed by Mastra span id, so each instance's tool work must nest under its own `execute_tool` span.
function startMockProvider(toolName) {
  const app = express();
  app.use(express.json());
  let call = 0;
  app.post('/v1/chat/completions', (req, res) => {
    const first = call++ === 0;
    res.json({
      id: first ? 'chatcmpl-tool' : 'chatcmpl-final',
      object: 'chat.completion',
      created: 1,
      model: req.body.model,
      choices: [
        {
          index: 0,
          finish_reason: first ? 'tool_calls' : 'stop',
          message: {
            role: 'assistant',
            content: first ? null : 'done',
            ...(first
              ? {
                  tool_calls: [
                    {
                      id: 'call_1',
                      type: 'function',
                      function: { name: toolName, arguments: '{"names":["apple","banana"]}' },
                    },
                  ],
                }
              : {}),
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
  });
  const server = app.listen(0);
  return { url: `http://localhost:${server.address().port}/v1`, close: () => server.close() };
}

function makeInstance(name, toolName) {
  const provider = startMockProvider(toolName);
  const agent = new Agent({
    id: name,
    name,
    instructions: 'Use the counting tool.',
    model: { id: 'openai/gpt-4o-mini', url: provider.url, apiKey: 'test' },
    tools: {
      [toolName]: createTool({
        id: toolName,
        description: 'Count the letters in each name',
        inputSchema: z.object({ names: z.array(z.string()) }),
        execute: async ({ names }) => {
          const loader = new DataLoader(async keys => keys.map(key => key.length));
          return { counts: await Promise.all(names.map(n => loader.load(n))) };
        },
      }),
    },
  });
  const mastra = new Mastra({
    agents: { [name]: agent },
    logger: false,
    observability: new Observability({
      configs: { default: { serviceName: 'mastra-test', exporters: [new SentryMastraExporter()] } },
    }),
  });
  return { mastra, provider, name };
}

async function run() {
  const a = makeInstance('agent_a', 'count_a');
  const b = makeInstance('agent_b', 'count_b');

  // One trace, both instances running concurrently, so their spans interleave through the one shared
  // registry.
  await Sentry.startSpan({ op: 'function', name: 'mastra-multi' }, async () => {
    await Promise.all([
      a.mastra.getAgent('agent_a').generate('count apple and banana', { maxSteps: 3 }),
      b.mastra.getAgent('agent_b').generate('count apple and banana', { maxSteps: 3 }),
    ]);
  });

  await Promise.all([a.mastra.observability.shutdown(), b.mastra.observability.shutdown()]);
  a.provider.close();
  b.provider.close();
}

run();
