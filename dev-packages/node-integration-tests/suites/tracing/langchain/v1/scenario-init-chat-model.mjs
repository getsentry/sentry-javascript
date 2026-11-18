import * as Sentry from '@sentry/node';
import express from 'express';
import { initChatModel } from 'langchain';
import { openAiChatCompletion, startMockServer } from '@sentry-internal/node-integration-tests';

function startMockOpenAIServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/chat/completions', (req, res) => {
    const model = req.body.model;

    if (model === 'error-model') {
      res.status(404).json({
        error: {
          message: 'Model not found',
          type: 'invalid_request_error',
          param: null,
          code: 'model_not_found',
        },
      });
      return;
    }

    // Simulate OpenAI response
    res.json(
      openAiChatCompletion(model, {
        id: 'chatcmpl-init-test-123',
        content: 'Hello from initChatModel!',
        usage: { prompt_tokens: 8, completion_tokens: 12 },
      }),
    );
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockOpenAIServer();
  const baseUrl = `${server.url}/v1`;

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    // Set OpenAI API key in environment
    process.env.OPENAI_API_KEY = 'mock-api-key';

    // Test 1: Initialize chat model using unified API with model string
    const model1 = await initChatModel('gpt-4o', {
      temperature: 0.7,
      maxTokens: 100,
      modelProvider: 'openai',
      configurableFields: ['model'],
      configuration: {
        baseURL: baseUrl,
      },
    });

    await model1.invoke('Tell me about LangChain');

    // Test 2: Initialize with different model
    const model2 = await initChatModel('gpt-3.5-turbo', {
      temperature: 0.5,
      modelProvider: 'openai',
      configuration: {
        baseURL: baseUrl,
      },
    });

    await model2.invoke([
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'What is AI?' },
    ]);

    // Test 3: Error handling
    try {
      const errorModel = await initChatModel('error-model', {
        modelProvider: 'openai',
        configuration: {
          baseURL: baseUrl,
        },
      });
      await errorModel.invoke('This will fail');
    } catch {
      // Expected error
    }
  });

  await Sentry.flush(2000);

  server.close();
}

run();
