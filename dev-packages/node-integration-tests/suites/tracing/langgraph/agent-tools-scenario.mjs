import { tool } from '@langchain/core/tools';
import { ChatAnthropic } from '@langchain/anthropic';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage } from '@langchain/core/messages';
import * as Sentry from '@sentry/node';
import express from 'express';
import { z } from 'zod';
import { anthropicMessage, startMockServer } from '@sentry-internal/node-integration-tests';

let callCount = 0;

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    callCount++;
    const model = req.body.model;

    if (callCount === 1) {
      // First call: model decides to call the "add" tool
      res.json(
        anthropicMessage(model, {
          id: 'msg_1',
          content: [{ type: 'tool_use', id: 'toolu_add_1', name: 'add', input: { a: 3, b: 5 } }],
          usage: { input_tokens: 20, output_tokens: 10 },
        }),
      );
    } else if (callCount === 2) {
      // Second call: model sees add result=8, calls "multiply"
      res.json(
        anthropicMessage(model, {
          id: 'msg_2',
          content: [{ type: 'tool_use', id: 'toolu_mul_1', name: 'multiply', input: { a: 8, b: 4 } }],
          usage: { input_tokens: 30, output_tokens: 10 },
        }),
      );
    } else {
      // Third call: model returns final answer
      res.json(
        anthropicMessage(model, {
          id: 'msg_3',
          content: 'The result is 32.',
          usage: { input_tokens: 40, output_tokens: 10 },
        }),
      );
    }
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockAnthropicServer();
  const baseUrl = server.url;

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const llm = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20241022',
      apiKey: 'mock-api-key',
      clientOptions: { baseURL: baseUrl },
    });

    const addTool = tool(
      async ({ a, b }) => {
        return String(a + b);
      },
      {
        name: 'add',
        description: 'Add two numbers',
        schema: z.object({ a: z.number(), b: z.number() }),
      },
    );

    const multiplyTool = tool(
      async ({ a, b }) => {
        return String(a * b);
      },
      {
        name: 'multiply',
        description: 'Multiply two numbers',
        schema: z.object({ a: z.number(), b: z.number() }),
      },
    );

    const agent = createReactAgent({
      llm,
      tools: [addTool, multiplyTool],
      name: 'math_assistant',
    });

    await agent.invoke(
      { messages: [new HumanMessage('Calculate (3 + 5) * 4')] },
      { configurable: { thread_id: 'math_thread' } },
    );
  });

  await Sentry.flush(2000);
  server.close();
}

run();
