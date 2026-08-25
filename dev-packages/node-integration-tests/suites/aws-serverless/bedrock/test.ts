import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const MODEL_ID = 'anthropic.claude-3-5-sonnet-20240620-v1:0';

function assertBedrockSpans(container: SerializedStreamedSpanContainer): void {
  // Converse (non-streaming)
  const converseSpan = container.items.find(span => span.name === `chat ${MODEL_ID}`);
  expect(converseSpan).toBeDefined();
  expect(converseSpan!.status).toBe('ok');
  expect(converseSpan!.attributes['sentry.origin'].value).toBe('auto.aws.aws_sdk');
  expect(converseSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
  expect(converseSpan!.attributes['gen_ai.provider.name'].value).toBe('aws.bedrock');
  expect(converseSpan!.attributes['gen_ai.operation.name'].value).toBe('chat');
  expect(converseSpan!.attributes['gen_ai.request.model'].value).toBe(MODEL_ID);
  expect(converseSpan!.attributes['gen_ai.request.max_tokens'].value).toBe(100);
  expect(converseSpan!.attributes['gen_ai.request.temperature'].value).toBe(0.5);
  expect(converseSpan!.attributes['gen_ai.request.top_p'].value).toBe(0.9);
  expect(converseSpan!.attributes['gen_ai.usage.input_tokens'].value).toBe(12);
  expect(converseSpan!.attributes['gen_ai.usage.output_tokens'].value).toBe(8);
  expect(converseSpan!.attributes['gen_ai.response.finish_reasons'].value).toEqual(['end_turn']);

  // InvokeModel (non-streaming, anthropic.claude request/response body)
  const invokeModelSpan = container.items.find(span => span.name === `generate_content ${MODEL_ID}`);
  expect(invokeModelSpan).toBeDefined();
  expect(invokeModelSpan!.status).toBe('ok');
  expect(invokeModelSpan!.attributes['sentry.origin'].value).toBe('auto.aws.aws_sdk');
  expect(invokeModelSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
  expect(invokeModelSpan!.attributes['gen_ai.provider.name'].value).toBe('aws.bedrock');
  expect(invokeModelSpan!.attributes['gen_ai.operation.name'].value).toBe('generate_content');
  expect(invokeModelSpan!.attributes['gen_ai.request.model'].value).toBe(MODEL_ID);
  expect(invokeModelSpan!.attributes['gen_ai.request.max_tokens'].value).toBe(100);
  expect(invokeModelSpan!.attributes['gen_ai.request.temperature'].value).toBe(0.5);
  expect(invokeModelSpan!.attributes['gen_ai.request.top_p'].value).toBe(0.9);
  expect(invokeModelSpan!.attributes['gen_ai.usage.input_tokens'].value).toBe(15);
  expect(invokeModelSpan!.attributes['gen_ai.usage.output_tokens'].value).toBe(9);
  expect(invokeModelSpan!.attributes['gen_ai.response.finish_reasons'].value).toEqual(['end_turn']);
}

describe('awsIntegration - Bedrock', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('auto-instruments Bedrock Converse and InvokeModel', { timeout: 90_000 }, async () => {
        await createTestRunner()
          .ignore('event')
          .expect({ transaction: transaction => expect(transaction.transaction).toBe('Test Transaction') })
          .expect({ span: assertBedrockSpans })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { '@aws-sdk/client-bedrock-runtime': '^3.1046.0' } },
  );
});
