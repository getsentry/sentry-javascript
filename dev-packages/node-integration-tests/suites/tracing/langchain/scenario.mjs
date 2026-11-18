import { ChatAnthropic } from '@langchain/anthropic';
import * as Sentry from '@sentry/node';
import express from 'express';
import { anthropicMessage, startMockServer } from '@sentry-internal/node-integration-tests';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    const model = req.body.model;

    if (model === 'error-model') {
      res
        .status(400)
        .set('request-id', 'mock-request-123')
        .json({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'Model not found',
          },
        });
      return;
    }

    // Simulate basic response
    res.json(anthropicMessage(model, { id: 'msg_test123', content: 'Mock response from Anthropic!' }));
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockAnthropicServer();
  const baseUrl = server.url;

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    // Test 1: Basic chat model invocation
    const model1 = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.7,
      maxTokens: 100,
      apiKey: 'mock-api-key',
      clientOptions: {
        baseURL: baseUrl,
      },
    });

    await model1.invoke('Tell me a joke');

    // Test 2: Chat with different model
    const model2 = new ChatAnthropic({
      model: 'claude-3-opus-20240229',
      temperature: 0.9,
      topP: 0.95,
      maxTokens: 200,
      apiKey: 'mock-api-key',
      clientOptions: {
        baseURL: baseUrl,
      },
    });

    await model2.invoke([
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'What is the capital of France?' },
    ]);

    // Test 3: Error handling
    const errorModel = new ChatAnthropic({
      model: 'error-model',
      apiKey: 'mock-api-key',
      clientOptions: {
        baseURL: baseUrl,
      },
    });

    try {
      await errorModel.invoke('This will fail');
    } catch {
      // Expected error
    }
  });

  await Sentry.flush(2000);

  server.close();
}

run();
