import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// `ai` SDK only support Node 18+
describe('Vercel AI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION_DEFAULT_PII_FALSE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - no telemetry config, should enable telemetry but not record inputs/outputs when sendDefaultPii: false
      expect.objectContaining({
        data: expect.objectContaining({
          'ai.completion_tokens.used': 20,
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.model_id': 'mock-model-id',
          'ai.operationId': 'ai.generateText',
          'ai.pipeline.name': 'generateText',
          'ai.prompt_tokens.used': 10,
          'ai.response.finishReason': 'stop',
          'ai.settings.maxRetries': 2,
          'ai.settings.maxSteps': 1,
          'ai.streaming': false,
          'ai.total_tokens.used': 30,
          'ai.usage.completionTokens': 20,
          'ai.usage.promptTokens': 10,
          'operation.name': 'ai.generateText',
          'sentry.op': 'ai.pipeline.generateText',
          'sentry.origin': 'auto.vercelai.otel',
        }),
        description: 'generateText',
        op: 'ai.pipeline.generateText',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Second span - explicitly enabled telemetry but recordInputs/recordOutputs not set, should not record when sendDefaultPii: false
      expect.objectContaining({
        data: expect.objectContaining({
          'ai.completion_tokens.used': 20,
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.model_id': 'mock-model-id',
          'ai.operationId': 'ai.generateText',
          'ai.pipeline.name': 'generateText',
          'ai.prompt_tokens.used': 10,
          'ai.response.finishReason': 'stop',
          'ai.settings.maxRetries': 2,
          'ai.settings.maxSteps': 1,
          'ai.streaming': false,
          'ai.total_tokens.used': 30,
          'ai.usage.completionTokens': 20,
          'ai.usage.promptTokens': 10,
          'operation.name': 'ai.generateText',
          'sentry.op': 'ai.pipeline.generateText',
          'sentry.origin': 'auto.vercelai.otel',
        }),
        description: 'generateText',
        op: 'ai.pipeline.generateText',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - no telemetry config, should enable telemetry AND record inputs/outputs when sendDefaultPii: true
      expect.objectContaining({
        data: expect.objectContaining({
          'ai.completion_tokens.used': 20,
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.model_id': 'mock-model-id',
          'ai.prompt': '{"prompt":"Where is the first span?"}',
          'ai.operationId': 'ai.generateText',
          'ai.pipeline.name': 'generateText',
          'ai.prompt_tokens.used': 10,
          'ai.response.finishReason': 'stop',
          'ai.input_messages': '{"prompt":"Where is the first span?"}',
          'ai.settings.maxRetries': 2,
          'ai.settings.maxSteps': 1,
          'ai.streaming': false,
          'ai.total_tokens.used': 30,
          'ai.usage.completionTokens': 20,
          'ai.usage.promptTokens': 10,
          'operation.name': 'ai.generateText',
          'sentry.op': 'ai.pipeline.generateText',
          'sentry.origin': 'auto.vercelai.otel',
        }),
        description: 'generateText',
        op: 'ai.pipeline.generateText',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Second span - explicitly enabled telemetry, should record inputs/outputs regardless of sendDefaultPii
      expect.objectContaining({
        data: expect.objectContaining({
          'ai.completion_tokens.used': 20,
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.model_id': 'mock-model-id',
          'ai.prompt': '{"prompt":"Where is the second span?"}',
          'ai.operationId': 'ai.generateText',
          'ai.pipeline.name': 'generateText',
          'ai.prompt_tokens.used': 10,
          'ai.response.finishReason': 'stop',
          'ai.input_messages': '{"prompt":"Where is the second span?"}',
          'ai.settings.maxRetries': 2,
          'ai.settings.maxSteps': 1,
          'ai.streaming': false,
          'ai.total_tokens.used': 30,
          'ai.usage.completionTokens': 20,
          'ai.usage.promptTokens': 10,
          'operation.name': 'ai.generateText',
          'sentry.op': 'ai.pipeline.generateText',
          'sentry.origin': 'auto.vercelai.otel',
        }),
        description: 'generateText',
        op: 'ai.pipeline.generateText',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates ai related spans with sendDefaultPii: false', async () => {
      await createRunner().expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE }).start().completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates ai related spans with sendDefaultPii: true', async () => {
      await createRunner().expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE }).start().completed();
    });
  });
});
