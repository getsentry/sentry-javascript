import { ChatAnthropic } from '@langchain/anthropic';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import * as Sentry from '@sentry/node';
import express from 'express';
import { anthropicMessage, startMockServer } from '@sentry-internal/node-integration-tests';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    res.json(
      anthropicMessage(req.body.model, {
        id: 'msg_chain_test',
        content: 'The weather is sunny.',
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockAnthropicServer();
  const baseUrl = server.url;

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

    const handler = Sentry.createLangChainCallbackHandler();

    await chain.invoke({ topic: 'weather' }, { callbacks: [handler] });
  });

  await Sentry.flush(2000);
  server.close();
}

run();
