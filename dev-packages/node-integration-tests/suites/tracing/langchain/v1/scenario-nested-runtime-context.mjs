import { ChatAnthropic } from '@langchain/anthropic';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons';
import { tool } from '@langchain/core/tools';
import * as Sentry from '@sentry/node';
import express from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';

// LangGraph does this on import. Plain `@langchain/core` keeps a no-op store, so runs started
// without a config would see no ambient config at all.
AsyncLocalStorageProviderSingleton.initializeGlobalInstance(new AsyncLocalStorage());

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    res.json({
      id: 'msg_nested_test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Sunny.' }],
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

  const model = new ChatAnthropic({
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0,
    maxTokens: 50,
    apiKey: 'mock-api-key',
    clientOptions: { baseURL: baseUrl },
  });

  // The nested chain gets no config, so the conversation id and parent run only reach the model
  // through LangChain's ambient runnable config.
  const lookupWeather = tool(
    async ({ city }) => {
      const nested = RunnableSequence.from([RunnableLambda.from(c => `Weather in ${c}?`), model]).withConfig({
        runName: 'nested_chain',
      });
      const result = await nested.invoke(city);
      return result.content;
    },
    {
      name: 'lookup_weather',
      description: 'Look up the weather',
      schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
    },
  );

  const outer = RunnableLambda.from(input => lookupWeather.invoke({ city: input.city })).withConfig({
    runName: 'outer',
  });

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await Sentry.startSpan({ op: 'function', name: 'auto' }, async () => {
      const stream = await outer.stream({ city: 'Paris' }, { configurable: { thread_id: 'thread_auto' } });
      for await (const _chunk of stream) {
        // drain
      }
    });

    await Sentry.startSpan({ op: 'function', name: 'handler' }, async () => {
      const stream = await outer.stream(
        { city: 'Paris' },
        {
          callbacks: [Sentry.createLangChainCallbackHandler()],
          configurable: { thread_id: 'thread_handler' },
        },
      );
      for await (const _chunk of stream) {
        // drain
      }
    });
  });

  await Sentry.flush(2000);
  server.close();
}

run();
