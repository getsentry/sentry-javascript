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
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.operationId': 'ai.generateText',
          'ai.pipeline.name': 'generateText',
          'ai.response.finishReason': 'stop',
          'ai.settings.maxRetries': 2,
          'ai.settings.maxSteps': 1,
          'ai.streaming': false,
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.usage.total_tokens': 30,
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
          'ai.streaming': false,
          'ai.response.finishReason': 'stop',
          'ai.response.model': 'mock-model-id',
          'ai.response.id': expect.any(String),
          'ai.response.timestamp': expect.any(String),
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.usage.total_tokens': 30,
        }),
        description: 'generateText.doGenerate',
        op: 'ai.run.doGenerate',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.operationId': 'ai.generateText',
          'ai.pipeline.name': 'generateText',
          'ai.prompt': '{"prompt":"Where is the second span?"}',
          'ai.response.finishReason': 'stop',
          'ai.response.text': expect.any(String),
          'ai.settings.maxRetries': 2,
          'ai.settings.maxSteps': 1,
          'ai.streaming': false,
          'gen_ai.prompt': '{"prompt":"Where is the second span?"}',
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.usage.total_tokens': 30,
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
          'ai.streaming': false,
          'ai.response.finishReason': 'stop',
          'ai.response.model': 'mock-model-id',
          'ai.response.id': expect.any(String),
          'ai.response.text': expect.any(String),
          'ai.response.timestamp': expect.any(String),
          'ai.prompt.format': expect.any(String),
          'ai.prompt.messages': expect.any(String),
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.usage.total_tokens': 30,
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
