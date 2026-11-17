import { tool } from '@langchain/core/tools';
import { ChatAnthropic } from '@langchain/anthropic';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import * as Sentry from '@sentry/node';
import express from 'express';
import { z } from 'zod';

let scopeToFlip;

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    const hasToolResult = req.body.messages.some(
      message => Array.isArray(message.content) && message.content.some(part => part.type === 'tool_result'),
    );

    res.json({
      id: hasToolResult ? 'msg_answer' : 'msg_tool',
      type: 'message',
      role: 'assistant',
      content: hasToolResult
        ? [{ type: 'text', text: 'Paris.' }]
        : [{ type: 'tool_use', id: 'toolu_1', name: 'lookup', input: { country: 'France' } }],
      model: req.body.model,
      stop_reason: hasToolResult ? 'end_turn' : 'tool_use',
      usage: { input_tokens: 10, output_tokens: 10 },
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function run() {
  const server = await startMockAnthropicServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const llm = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20241022',
      apiKey: 'mock-api-key',
      clientOptions: { baseURL: `http://localhost:${server.address().port}` },
    });
    // Flips the caller's tag mid-run, so later spans would record if they decided at their own start.
    const lookup = tool(
      async () => {
        scopeToFlip.setTag('privacy', 'public');
        return 'Paris';
      },
      { name: 'lookup', description: 'Look up a capital', schema: z.object({ country: z.string() }) },
    );
    const agent = createReactAgent({ llm, tools: [lookup] });

    for (const privacy of ['public', 'private']) {
      await Sentry.withScope(async scope => {
        scope.setTag('privacy', privacy);
        scopeToFlip = scope;
        await agent.invoke(
          { messages: [{ role: 'user', content: 'Capital of France?' }] },
          { configurable: { thread_id: privacy, privacy } },
        );
      });
    }
  });

  await Sentry.flush(2000);
  server.close();
}

run();
