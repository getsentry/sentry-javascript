import express from 'express';
import * as Sentry from '@sentry/node';
import { z } from 'zod';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { Observability } from '@mastra/observability';
import { SentryMastraExporter } from '@sentry/node';
import DataLoader from 'dataloader';

// Same as scenario-tool-nesting, but drives the agent via `stream()` (consumed to completion) instead
// of `generate()`, to confirm the active-context bridge nests tool work under the exporter spans on the
// streaming API too. `agent.stream` makes a streaming provider request, so the mock answers with SSE.
function startMockProvider(responses) {
  const app = express();
  app.use(express.json());
  let call = 0;

  app.post('/v1/chat/completions', (req, res) => {
    const response = responses[Math.min(call, responses.length - 1)];
    call++;
    const finishReason = response.toolCalls ? 'tool_calls' : 'stop';

    if (!req.body.stream) {
      res.json({
        id: response.id,
        object: 'chat.completion',
        created: 1,
        model: req.body.model,
        choices: [
          {
            index: 0,
            finish_reason: finishReason,
            message: {
              role: 'assistant',
              content: response.content ?? null,
              ...(response.toolCalls ? { tool_calls: response.toolCalls } : {}),
            },
          },
        ],
        usage: response.usage,
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    const base = { id: response.id, object: 'chat.completion.chunk', created: 1, model: req.body.model };
    const send = delta => res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, ...delta }] })}\n\n`);

    if (response.toolCalls) {
      const tc = response.toolCalls[0];
      send({
        delta: {
          role: 'assistant',
          tool_calls: [{ index: 0, id: tc.id, type: 'function', function: { name: tc.function.name, arguments: '' } }],
        },
        finish_reason: null,
      });
      send({
        delta: { tool_calls: [{ index: 0, function: { arguments: tc.function.arguments } }] },
        finish_reason: null,
      });
      send({ delta: {}, finish_reason: 'tool_calls' });
    } else {
      send({ delta: { role: 'assistant', content: response.content ?? '' }, finish_reason: null });
      send({ delta: {}, finish_reason: 'stop' });
    }
    res.write(`data: ${JSON.stringify({ ...base, choices: [], usage: response.usage })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });

  const server = app.listen(0);
  return { url: `http://localhost:${server.address().port}/v1`, close: () => server.close() };
}

const provider = startMockProvider([
  {
    id: 'chatcmpl-tool',
    toolCalls: [
      { id: 'call_1', type: 'function', function: { name: 'count_items', arguments: '{"names":["apple","banana"]}' } },
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
      configs: { default: { serviceName: 'mastra-test', exporters: [new SentryMastraExporter()] } },
    }),
  });

  await Sentry.startSpan({ op: 'function', name: 'mastra-test' }, async () => {
    const stream = await mastra
      .getAgent('counter_agent')
      .stream('Count the letters in apple and banana.', { maxSteps: 3 });
    // Drive the whole run to completion (executes the tool step), not just the text output.
    if (typeof stream.getFullOutput === 'function') {
      await stream.getFullOutput();
    } else if (typeof stream.consumeStream === 'function') {
      await stream.consumeStream();
    } else {
      for await (const _chunk of stream.fullStream ?? stream.textStream) {
        void _chunk;
      }
    }
  });

  await mastra.observability.shutdown();
  provider.close();
}

run();
