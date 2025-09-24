import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('Google GenAI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION_DEFAULT_PII_FALSE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - chats.create
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-pro',
          'gen_ai.request.temperature': 0.8,
          'gen_ai.request.top_p': 0.9,
          'gen_ai.request.max_tokens': 150,
        },
        description: 'chat gemini-1.5-pro create',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Second span - chat.sendMessage (should get model from context)
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-pro', // Should get from chat context
          'gen_ai.usage.input_tokens': 8,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 20,
        },
        description: 'chat gemini-1.5-pro',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Third span - models.generateContent
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-flash',
          'gen_ai.request.temperature': 0.7,
          'gen_ai.request.top_p': 0.9,
          'gen_ai.request.max_tokens': 100,
          'gen_ai.usage.input_tokens': 8,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 20,
        },
        description: 'models gemini-1.5-flash',
        op: 'gen_ai.models',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Fourth span - error handling
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'error-model',
        },
        description: 'models error-model',
        op: 'gen_ai.models',
        origin: 'auto.ai.google_genai',
        status: 'unknown_error',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - chats.create with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-pro',
          'gen_ai.request.temperature': 0.8,
          'gen_ai.request.top_p': 0.9,
          'gen_ai.request.max_tokens': 150,
          'gen_ai.request.messages': expect.any(String), // Should include history when recordInputs: true
        }),
        description: 'chat gemini-1.5-pro create',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Second span - chat.sendMessage with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-pro',
          'gen_ai.request.messages': expect.any(String), // Should include message when recordInputs: true
          'gen_ai.response.text': expect.any(String), // Should include response when recordOutputs: true
          'gen_ai.usage.input_tokens': 8,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 20,
        }),
        description: 'chat gemini-1.5-pro',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Third span - models.generateContent with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'gemini-1.5-flash',
          'gen_ai.request.temperature': 0.7,
          'gen_ai.request.top_p': 0.9,
          'gen_ai.request.max_tokens': 100,
          'gen_ai.request.messages': expect.any(String), // Should include contents when recordInputs: true
          'gen_ai.response.text': expect.any(String), // Should include response when recordOutputs: true
          'gen_ai.usage.input_tokens': 8,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 20,
        }),
        description: 'models gemini-1.5-flash',
        op: 'gen_ai.models',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Fourth span - error handling with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.google_genai',
          'gen_ai.system': 'google_genai',
          'gen_ai.request.model': 'error-model',
          'gen_ai.request.messages': expect.any(String), // Should include contents when recordInputs: true
        }),
        description: 'models error-model',
        op: 'gen_ai.models',
        origin: 'auto.ai.google_genai',
        status: 'unknown_error',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_WITH_OPTIONS = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // Check that custom options are respected
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.request.messages': expect.any(String), // Should include messages when recordInputs: true
          'gen_ai.response.text': expect.any(String), // Should include response text when recordOutputs: true
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates google genai related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates google genai related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('creates google genai related spans with custom options', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_WITH_OPTIONS })
        .start()
        .completed();
    });
  });
});
