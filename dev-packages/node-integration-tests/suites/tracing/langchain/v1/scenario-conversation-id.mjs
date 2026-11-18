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

    const formatStep = RunnableLambda.from(input => `Tell me about: ${input.topic}`);
    const chain = RunnableSequence.from([formatStep, model]);

    // `@langchain/core` >= 1.1.40 no longer copies `configurable` into run metadata for our handler,
    // so the integration copies the conversation id keys itself.
    await chain.invoke({ topic: 'weather' }, { configurable: { thread_id: 'thread_from_config' } });
    await chain.invoke({ topic: 'weather' }, { configurable: { sessionId: 'session_from_config' } });

    Sentry.setConversationId('conversation_from_scope');
    await chain.invoke({ topic: 'weather' }, { configurable: { thread_id: 'thread_ignored' } });
    Sentry.setConversationId(null);

    await chain.invoke({ topic: 'weather' });
  });

  await Sentry.flush(2000);
  server.close();
}

run();
