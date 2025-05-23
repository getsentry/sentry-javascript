import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// `ai` SDK only support Node 18+
describe('ai', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION = {
    transaction: 'main',
    spans: expect.arrayContaining([
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
      expect.objectContaining({
        data: expect.objectContaining({
          'sentry.origin': 'auto.vercelai.otel',
          'sentry.op': 'ai.run.doGenerate',
          'operation.name': 'ai.generateText.doGenerate',
          'ai.operationId': 'ai.generateText.doGenerate',
          'ai.model.provider': 'mock-provider',
          'ai.model.id': 'mock-model-id',
          'ai.settings.maxRetries': 2,
          'gen_ai.system': 'mock-provider',
          'gen_ai.request.model': 'mock-model-id',
          'ai.pipeline.name': 'generateText.doGenerate',
          'ai.model_id': 'mock-model-id',
          'ai.streaming': false,
          'ai.response.finishReason': 'stop',
          'ai.response.model': 'mock-model-id',
          'ai.usage.promptTokens': 10,
          'ai.usage.completionTokens': 20,
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'ai.completion_tokens.used': 20,
          'ai.prompt_tokens.used': 10,
          'ai.total_tokens.used': 30,
        }),
        description: 'generateText.doGenerate',
        op: 'ai.run.doGenerate',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
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
      expect.objectContaining({
        data: expect.objectContaining({
          'sentry.origin': 'auto.vercelai.otel',
          'sentry.op': 'ai.run.doGenerate',
          'operation.name': 'ai.generateText.doGenerate',
          'ai.operationId': 'ai.generateText.doGenerate',
          'ai.model.provider': 'mock-provider',
          'ai.model.id': 'mock-model-id',
          'ai.settings.maxRetries': 2,
          'gen_ai.system': 'mock-provider',
          'gen_ai.request.model': 'mock-model-id',
          'ai.pipeline.name': 'generateText.doGenerate',
          'ai.model_id': 'mock-model-id',
          'ai.streaming': false,
          'ai.response.finishReason': 'stop',
          'ai.response.model': 'mock-model-id',
          'ai.usage.promptTokens': 10,
          'ai.usage.completionTokens': 20,
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'ai.completion_tokens.used': 20,
          'ai.prompt_tokens.used': 10,
          'ai.total_tokens.used': 30,
        }),
        description: 'generateText.doGenerate',
        op: 'ai.run.doGenerate',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates ai related spans ', async () => {
      await createRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
    });
  });
});
