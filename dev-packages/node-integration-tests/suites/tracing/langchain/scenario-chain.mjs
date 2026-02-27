import { ChatAnthropic } from '@langchain/anthropic';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { createLangChainCallbackHandler } from '@sentry/core';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    res.json({
      id: 'msg_chain_test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'The weather is sunny.' }],
      model: req.body.model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
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
    const model = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0,
      maxTokens: 50,
      apiKey: 'mock-api-key',
      clientOptions: { baseURL: baseUrl },
    });

    const formatStep = RunnableLambda.from(input => `Tell me about: ${input.topic}`).withConfig({
      runName: 'format_prompt',
    });

    const parseStep = RunnableLambda.from(output => output.content[0].text).withConfig({
      runName: 'parse_output',
    });

    const chain = RunnableSequence.from([formatStep, model, parseStep]);

    const handler = createLangChainCallbackHandler();

    await chain.invoke({ topic: 'weather' }, { callbacks: [handler] });
  });

  await Sentry.flush(2000);
  server.close();
}

run();
