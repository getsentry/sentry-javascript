import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('Vercel AI integration - generateObject', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // generateObject span
      expect.objectContaining({
        data: expect.objectContaining({
          'vercel.ai.model.id': 'mock-model-id',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateObject',
          'vercel.ai.pipeline.name': 'generateObject',
          'vercel.ai.streaming': false,
          'vercel.ai.settings.mode': 'json',
          'vercel.ai.settings.output': 'object',
          'gen_ai.request.schema': expect.any(String),
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.usage.input_tokens': 15,
          'gen_ai.usage.output_tokens': 25,
          'gen_ai.usage.total_tokens': 40,
          'gen_ai.operation.name': 'invoke_agent',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.vercelai.otel',
        }),
        description: 'generateObject',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // generateObject.doGenerate span
      expect.objectContaining({
        data: expect.objectContaining({
          'sentry.origin': 'auto.vercelai.otel',
          'sentry.op': 'gen_ai.generate_object',
          'gen_ai.operation.name': 'generate_content',
          'vercel.ai.operationId': 'ai.generateObject.doGenerate',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.model.id': 'mock-model-id',
          'vercel.ai.pipeline.name': 'generateObject.doGenerate',
          'vercel.ai.streaming': false,
          'gen_ai.system': 'mock-provider',
          'gen_ai.request.model': 'mock-model-id',
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.usage.input_tokens': 15,
          'gen_ai.usage.output_tokens': 25,
          'gen_ai.usage.total_tokens': 40,
        }),
        description: 'generate_object mock-model-id',
        op: 'gen_ai.generate_object',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-generate-object.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures generateObject spans with schema attributes', async () => {
      await createRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
    });
  });
});
