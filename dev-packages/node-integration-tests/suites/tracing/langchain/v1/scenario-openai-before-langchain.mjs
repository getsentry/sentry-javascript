import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    res.json({
      id: 'msg_test123',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Mock response from Anthropic!',
        },
      ],
      model: req.body.model,
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
  const baseURL = `http://localhost:${server.address().port}`;

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    // EDGE CASE: Import and instantiate Anthropic client BEFORE LangChain is imported
    // This simulates the timing issue where a user creates an Anthropic client in one file
    // before importing LangChain in another file
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropicClient = new Anthropic({
      apiKey: 'mock-api-key',
      baseURL,
    });

    // Use the Anthropic client directly - this will be instrumented by the Anthropic integration
    await anthropicClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'Direct Anthropic call' }],
      temperature: 0.7,
      max_tokens: 100,
    });

    // NOW import LangChain - at this point it will mark Anthropic to be skipped
    // But the client created above is already instrumented
    const { ChatAnthropic } = await import('@langchain/anthropic');

    // Create a LangChain model - this uses Anthropic under the hood
    const langchainModel = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.7,
      maxTokens: 100,
      apiKey: 'mock-api-key',
      clientOptions: {
        baseURL,
      },
    });

    // Use LangChain - this will be instrumented by LangChain integration
    await langchainModel.invoke('LangChain Anthropic call');

    // Create ANOTHER Anthropic client after LangChain was imported
    // This one should NOT be instrumented (skip mechanism works correctly)
    const anthropicClient2 = new Anthropic({
      apiKey: 'mock-api-key',
      baseURL,
    });

    await anthropicClient2.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'Second direct Anthropic call' }],
      temperature: 0.7,
      max_tokens: 100,
    });
  });

  await Sentry.flush(2000);
  server.close();
}

run();
