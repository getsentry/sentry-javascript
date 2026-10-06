import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const MODEL_ID = 'anthropic.claude-3-5-sonnet-20240620-v1:0';

function assertBedrockSpans(container: SerializedStreamedSpanContainer): void {
  const segment = container.items.find(span => span.is_segment && span.name === 'Test Transaction');
  expect(segment).toBeDefined();

  // Converse (non-streaming)
  const converseSpan = container.items.find(span => span.name === `chat ${MODEL_ID}`);
  expect(converseSpan!.status).toBe('ok');
  expect(converseSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.aws.aws_sdk');
  expect(converseSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
  expect(converseSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('aws.bedrock');
  expect(converseSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
  expect(converseSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe(MODEL_ID);
  expect(converseSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
  expect(converseSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.5);
  expect(converseSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.9);
  expect(converseSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(12);
  expect(converseSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(8);
  expect(converseSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS].value).toEqual(['end_turn']);

  // InvokeModel (non-streaming, anthropic.claude request/response body)
  const invokeModelSpan = container.items.find(span => span.name === `generate_content ${MODEL_ID}`);
  expect(invokeModelSpan!.status).toBe('ok');
  expect(invokeModelSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.aws.aws_sdk');
  expect(invokeModelSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');
  expect(invokeModelSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('aws.bedrock');
  expect(invokeModelSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
  expect(invokeModelSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe(MODEL_ID);
  expect(invokeModelSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
  expect(invokeModelSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.5);
  expect(invokeModelSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.9);
  expect(invokeModelSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(15);
  expect(invokeModelSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(9);
  expect(invokeModelSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS].value).toEqual(['end_turn']);
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
        await createTestRunner().ignore('event').expect({ span: assertBedrockSpans }).start().completed();
      });
    },
    { additionalDependencies: { '@aws-sdk/client-bedrock-runtime': '^3.1046.0' } },
  );
});
