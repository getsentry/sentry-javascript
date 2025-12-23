import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    const model = req.body.model;

    // Simulate basic response
    res.json({
      id: 'msg_react_agent_123',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Mock response from Anthropic!',
        },
      ],
      model: model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 15,
      },
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

async function run() {
  const server = await startMockAnthropicServer();
  const baseUrl = `http://localhost:${server.address().port}`;

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    // Create mocked LLM instance
    const llm = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20241022',
      apiKey: 'mock-api-key',
      clientOptions: {
        baseURL: baseUrl,
      },
    });

    // Create a simple react agent with no tools
    const agent = createReactAgent({ llm, tools: [] });

    // Test: basic invocation
    await agent.invoke({
      messages: [new SystemMessage('You are a helpful assistant.'), new HumanMessage('What is the weather today?')],
    });
  });

  await Sentry.flush(2000);

  server.close();
}

run();
