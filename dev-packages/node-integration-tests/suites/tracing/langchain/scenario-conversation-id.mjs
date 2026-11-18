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
        id: 'msg_conversation_test',
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

    const chain = RunnableSequence.from([formatStep, model]).withConfig({
      runName: 'weather_chain',
    });

    const handler = Sentry.createLangChainCallbackHandler();

    // 1. `configurable.thread_id` is copied into run metadata by LangChain and inherited by every
    //    child run, so the chain, the lambda step and the chat call all carry it.
    await chain.invoke(
      { topic: 'weather' },
      {
        callbacks: [handler],
        configurable: { thread_id: 'thread_from_config' },
      },
    );

    // 2. `RunnableWithMessageHistory`-style `sessionId` is picked up too.
    await chain.invoke(
      { topic: 'weather' },
      {
        callbacks: [handler],
        configurable: { sessionId: 'session_from_config' },
      },
    );

    // 3. An id set on the scope outranks the one from the config.
    Sentry.setConversationId('conversation_from_scope');
    await chain.invoke({ topic: 'weather' }, { callbacks: [handler], configurable: { thread_id: 'thread_ignored' } });
    Sentry.setConversationId(null);

    // 4. No id anywhere leaves the attribute unset.
    await chain.invoke({ topic: 'weather' }, { callbacks: [handler] });
  });

  await Sentry.flush(2000);
  server.close();
}

run();
