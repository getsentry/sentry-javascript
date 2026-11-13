import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT, GEN_AI_GENERATE_CONTENT } from '@sentry/conventions/op';
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
  expect(converseSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.aws_sdk');
  expect(converseSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
  expect(converseSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('aws.bedrock');
  expect(converseSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
  expect(converseSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe(MODEL_ID);
  expect(converseSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
  expect(converseSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.5);
  expect(converseSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.9);
  expect(converseSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(12);
  expect(converseSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(8);
  expect(converseSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS].value).toBe('["end_turn"]');

  // InvokeModel (non-streaming, anthropic.claude request/response body)
  const invokeModelSpan = container.items.find(span => span.name === `generate_content ${MODEL_ID}`);
  expect(invokeModelSpan!.status).toBe('ok');
  expect(invokeModelSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.aws_sdk');
  expect(invokeModelSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');
  expect(invokeModelSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('aws.bedrock');
  expect(invokeModelSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
  expect(invokeModelSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe(MODEL_ID);
  expect(invokeModelSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
  expect(invokeModelSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.5);
  expect(invokeModelSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.9);
  expect(invokeModelSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(15);
  expect(invokeModelSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(9);
  expect(invokeModelSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS].value).toBe('["end_turn"]');
}

const SYSTEM_INSTRUCTIONS = JSON.stringify([{ type: 'text', content: 'You are a weather bot.' }]);

const OUTPUT_MESSAGES = JSON.stringify([
  { role: 'assistant', parts: [{ type: 'text', content: 'Hello from Bedrock' }], finish_reason: 'end_turn' },
]);

function assertBedrockContent(container: SerializedStreamedSpanContainer): void {
  const converseSpan = container.items.find(span => span.name === `chat ${MODEL_ID}`);
  expect(converseSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe(SYSTEM_INSTRUCTIONS);
  expect(converseSpan!.attributes[GEN_AI_INPUT_MESSAGES].value).toBe(
    JSON.stringify([{ role: 'user', parts: [{ type: 'text', content: 'Hello' }] }]),
  );
  expect(converseSpan!.attributes[GEN_AI_TOOL_DEFINITIONS].value).toBe(
    JSON.stringify([{ name: 'get_weather', inputSchema: { json: { type: 'object' } } }]),
  );
  expect(converseSpan!.attributes[GEN_AI_OUTPUT_MESSAGES].value).toBe(OUTPUT_MESSAGES);

  const invokeModelSpan = container.items.find(span => span.name === `generate_content ${MODEL_ID}`);
  expect(invokeModelSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe(SYSTEM_INSTRUCTIONS);
  expect(invokeModelSpan!.attributes[GEN_AI_INPUT_MESSAGES].value).toBe(
    JSON.stringify([{ role: 'user', content: 'Hello' }]),
  );
  expect(invokeModelSpan!.attributes[GEN_AI_OUTPUT_MESSAGES].value).toBe(OUTPUT_MESSAGES);
}

function assertStreamSpans(container: SerializedStreamedSpanContainer): void {
  const converseStreamSpan = container.items.find(span => span.name === `chat ${MODEL_ID}`);
  expect(converseStreamSpan!.status).toBe('ok');
  expect(converseStreamSpan!.attributes[SENTRY_OP].value).toBe(GEN_AI_CHAT);
  expect(converseStreamSpan!.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
  expect(converseStreamSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(12);
  expect(converseStreamSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(8);
  expect(converseStreamSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS].value).toBe('["tool_use"]');

  const invokeStreamSpan = container.items.find(span => span.name === `generate_content ${MODEL_ID}`);
  expect(invokeStreamSpan!.status).toBe('ok');
  expect(invokeStreamSpan!.attributes[SENTRY_OP].value).toBe(GEN_AI_GENERATE_CONTENT);
  expect(invokeStreamSpan!.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
  expect(invokeStreamSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(15);
  expect(invokeStreamSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(9);
  expect(invokeStreamSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS].value).toBe('["end_turn"]');

  const failedStreamSpan = container.items.find(span => span.name === 'chat amazon.nova-pro-v1:0');
  expect(failedStreamSpan!.status).toBe('error');

  // `cancelled` is sent as `ok` under span streaming.
  const abortedStreamSpan = container.items.find(span => span.name === 'chat amazon.nova-lite-v1:0');
  expect(abortedStreamSpan!.status).toBe('ok');
}

describe('awsIntegration - Bedrock', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('auto-instruments Bedrock Converse and InvokeModel', { timeout: 90_000 }, async () => {
      await createTestRunner().ignore('event').expect({ span: assertBedrockSpans }).start().completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-gen-ai.mjs', (createTestRunner, test) => {
    test('records Bedrock inputs and outputs by default', { timeout: 90_000 }, async () => {
      await createTestRunner().ignore('event').expect({ span: assertBedrockContent }).start().completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-stream.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('ends Bedrock stream spans when the streams finish, fail, or are aborted', { timeout: 90_000 }, async () => {
      await createTestRunner().ignore('event').expect({ span: assertStreamSpans }).start().completed();
    });
  });
});
