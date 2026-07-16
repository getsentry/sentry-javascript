import type { TransactionEvent } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { isOrchestrionEnabled } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// The suite runs twice on CI: once with the OTel `Aws` integration (default) and once with the
// orchestrion diagnostics-channel integration auto-injected (`INJECT_ORCHESTRION`). Both emit the
// same gen_ai spans; only the origin differs.
const ORIGIN = isOrchestrionEnabled() ? 'auto.aws.orchestrion.aws_sdk' : 'auto.otel.aws';

const MODEL_ID = 'anthropic.claude-3-5-sonnet-20240620-v1:0';

function assertBedrockSpans(transaction: TransactionEvent): void {
  const spans = transaction.spans ?? [];

  expect(transaction.transaction).toBe('Test Transaction');

  // Converse (non-streaming)
  expect(spans, 'expected a Bedrock Converse span').toContainEqual(
    expect.objectContaining({
      description: `chat ${MODEL_ID}`,
      origin: ORIGIN,
      status: 'ok',
      data: expect.objectContaining({
        'sentry.origin': ORIGIN,
        'gen_ai.system': 'aws.bedrock',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': MODEL_ID,
        'gen_ai.request.max_tokens': 100,
        'gen_ai.request.temperature': 0.5,
        'gen_ai.request.top_p': 0.9,
        'gen_ai.usage.input_tokens': 12,
        'gen_ai.usage.output_tokens': 8,
        'gen_ai.response.finish_reasons': ['end_turn'],
      }),
    }),
  );

  // InvokeModel (non-streaming, anthropic.claude request/response body)
  expect(spans, 'expected a Bedrock InvokeModel span').toContainEqual(
    expect.objectContaining({
      origin: ORIGIN,
      status: 'ok',
      data: expect.objectContaining({
        'sentry.origin': ORIGIN,
        'gen_ai.system': 'aws.bedrock',
        'gen_ai.request.model': MODEL_ID,
        'gen_ai.request.max_tokens': 100,
        'gen_ai.request.temperature': 0.5,
        'gen_ai.request.top_p': 0.9,
        'gen_ai.usage.input_tokens': 15,
        'gen_ai.usage.output_tokens': 9,
        'gen_ai.response.finish_reasons': ['end_turn'],
      }),
    }),
  );
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
        await createTestRunner().ignore('event').expect({ transaction: assertBedrockSpans }).start().completed();
      });
    },
    { additionalDependencies: { '@aws-sdk/client-bedrock-runtime': '^3.1046.0' } },
  );
});
