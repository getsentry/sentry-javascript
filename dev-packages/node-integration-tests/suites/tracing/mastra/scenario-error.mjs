import express from 'express';
import * as Sentry from '@sentry/node';
import { z } from 'zod';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { Observability } from '@mastra/observability';
import { SentryMastraExporter } from '@sentry/node';

// A tool that throws. The model recovers on the next step (so `generate` resolves cleanly), but the
// thrown error still surfaces through Mastra's `executeWithContext` and should be captured as an issue.
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
  return { url: `http://localhost:${server.address().port}/v1`, close: () => server.close() };
}

const provider = startMockProvider([
  {
    id: 'chatcmpl-tool',
    toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'fail_now', arguments: '{}' } }],
    usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
  },
  {
    id: 'chatcmpl-final',
    content: 'Sorry, that failed.',
    usage: { prompt_tokens: 30, completion_tokens: 8, total_tokens: 38 },
  },
]);

async function run() {
  const agent = new Agent({
    id: 'failing_agent',
    name: 'failing_agent',
    instructions: 'Call the failing tool.',
    model: { id: 'openai/gpt-4o-mini', url: provider.url, apiKey: 'test' },
    tools: {
      fail_now: createTool({
        id: 'fail_now',
        description: 'Always throws',
        inputSchema: z.object({}),
        execute: async () => {
          throw new Error('tool blew up');
        },
      }),
    },
  });

  const mastra = new Mastra({
    agents: { failing_agent: agent },
    logger: false,
    observability: new Observability({
      configs: { default: { serviceName: 'mastra-test', exporters: [new SentryMastraExporter()] } },
    }),
  });

  await Sentry.startSpan({ op: 'function', name: 'mastra-test' }, async () => {
    await mastra.getAgent('failing_agent').generate('Please fail.', { maxSteps: 3 });
  });

  await mastra.observability.shutdown();
  provider.close();
}

run();
