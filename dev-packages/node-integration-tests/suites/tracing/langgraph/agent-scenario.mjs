import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import * as Sentry from '@sentry/node';
import express from 'express';
import { anthropicMessage, startMockServer } from '@sentry-internal/node-integration-tests';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    const model = req.body.model;

    res.json(
      anthropicMessage(model, {
        id: 'msg_react_agent_123',
        content: 'Paris is the capital of France.',
        usage: { input_tokens: 20, output_tokens: 10 },
      }),
    );
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
      clientOptions: {
        baseURL: baseUrl,
      },
    });

    const agent = createReactAgent({ llm, tools: [], name: 'helpful_assistant' });

    await agent.invoke({
      messages: [new SystemMessage('You are a helpful assistant.'), new HumanMessage('What is the capital of France?')],
    });
  });

  await Sentry.flush(2000);
  server.close();
}

run();
