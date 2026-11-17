import express from 'express';
import * as Sentry from '@sentry/node';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';

// Inlined OpenAI-compatible mock: the ESM/CJS runner copies only this file into its temp dir.
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
    id: 'chatcmpl-1',
    content: 'It is 22C in Berlin.',
    usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
  },
]);

async function run() {
  const model = { id: 'openai/gpt-4o-mini', url: provider.url, apiKey: 'test' };
  const agents = {
    public_agent: new Agent({
      id: 'public_agent',
      name: 'public_agent',
      instructions: 'You report the weather.',
      model,
    }),
    private_agent: new Agent({
      id: 'private_agent',
      name: 'private_agent',
      instructions: 'You report the weather.',
      model,
    }),
  };
  const mastra = new Mastra({ agents, logger: false });

  await Sentry.startSpan({ op: 'function', name: 'mastra-test' }, async () => {
    await mastra.getAgent('public_agent').generate('What is the weather in Berlin?');
    await mastra.getAgent('private_agent').generate('What is the weather in Berlin?');
  });

  await mastra.observability.shutdown();
  provider.close();
}

run();
