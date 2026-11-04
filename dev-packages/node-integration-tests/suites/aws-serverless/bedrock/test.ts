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
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const MODEL_ID = 'anthropic.claude-3-5-sonnet-20240620-v1:0';

const CONTENT_ATTRIBUTES = [
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_OUTPUT_MESSAGES,
];

const SYSTEM_INSTRUCTIONS = JSON.stringify([{ type: 'text', content: 'You are a helpful assistant.' }]);
const CONVERSE_INPUT_MESSAGES = JSON.stringify([{ role: 'user', parts: [{ type: 'text', content: 'Hello' }] }]);
const CONVERSE_OUTPUT_MESSAGES = JSON.stringify([
  {
    role: 'assistant',
    parts: [
      { type: 'text', content: 'Hello from Bedrock' },
      { type: 'tool_call', id: 'tooluse_1', name: 'get_weather', arguments: '{"city":"Vienna"}' },
    ],
    finish_reason: 'tool_use',
  },
]);

function findSpan(container: SerializedStreamedSpanContainer, name: string) {
  const span = container.items.find(item => item.name === name);
  expect(span).toBeDefined();
  return span!;
}

function assertBedrockSpans(container: SerializedStreamedSpanContainer): void {
  const segment = container.items.find(span => span.is_segment && span.name === 'Test Transaction');
  expect(segment).toBeDefined();

  // Converse (non-streaming)
  const converseSpan = findSpan(container, `chat ${MODEL_ID}`);
  expect(converseSpan.status).toBe('ok');
  expect(converseSpan.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.aws_sdk');
  expect(converseSpan.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
  expect(converseSpan.attributes[GEN_AI_PROVIDER_NAME].value).toBe('aws.bedrock');
  expect(converseSpan.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
  expect(converseSpan.attributes[GEN_AI_REQUEST_MODEL].value).toBe(MODEL_ID);
  expect(converseSpan.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
  expect(converseSpan.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.5);
  expect(converseSpan.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.9);
  expect(converseSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(12);
  expect(converseSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(8);
  expect(converseSpan.attributes[GEN_AI_RESPONSE_FINISH_REASONS].value).toBe('["tool_use"]');

  // InvokeModel (non-streaming, anthropic.claude request/response body)
  const invokeModelSpan = findSpan(container, `generate_content ${MODEL_ID}`);
  expect(invokeModelSpan.status).toBe('ok');
  expect(invokeModelSpan.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.aws_sdk');
  expect(invokeModelSpan.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');
  expect(invokeModelSpan.attributes[GEN_AI_PROVIDER_NAME].value).toBe('aws.bedrock');
  expect(invokeModelSpan.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
  expect(invokeModelSpan.attributes[GEN_AI_REQUEST_MODEL].value).toBe(MODEL_ID);
  expect(invokeModelSpan.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
  expect(invokeModelSpan.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.5);
  expect(invokeModelSpan.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.9);
  expect(invokeModelSpan.attributes[GEN_AI_RESPONSE_ID].value).toBe('msg_bdrk_1');
  expect(invokeModelSpan.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('claude-3-5-sonnet-20240620');
  expect(invokeModelSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(15);
  expect(invokeModelSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(9);
  expect(invokeModelSpan.attributes[GEN_AI_RESPONSE_FINISH_REASONS].value).toBe('["end_turn"]');
}

function assertBedrockContent(container: SerializedStreamedSpanContainer): void {
  const converseSpan = findSpan(container, `chat ${MODEL_ID}`);
  expect(converseSpan.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe(SYSTEM_INSTRUCTIONS);
  expect(converseSpan.attributes[GEN_AI_INPUT_MESSAGES].value).toBe(CONVERSE_INPUT_MESSAGES);
  expect(converseSpan.attributes[GEN_AI_TOOL_DEFINITIONS].value).toBe(
    JSON.stringify([
      {
        name: 'get_weather',
        description: 'Get the weather for a city',
        inputSchema: { json: { type: 'object', properties: { city: { type: 'string' } } } },
      },
    ]),
  );
  expect(converseSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value).toBe(CONVERSE_OUTPUT_MESSAGES);

  const invokeModelSpan = findSpan(container, `generate_content ${MODEL_ID}`);
  expect(invokeModelSpan.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe(SYSTEM_INSTRUCTIONS);
  expect(invokeModelSpan.attributes[GEN_AI_INPUT_MESSAGES].value).toBe(
    JSON.stringify([{ role: 'user', content: 'Hello' }]),
  );
  expect(invokeModelSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value).toBe(
    JSON.stringify([
      { role: 'assistant', parts: [{ type: 'text', content: 'Hello from Bedrock' }], finish_reason: 'end_turn' },
    ]),
  );
}

function assertNoContent(container: SerializedStreamedSpanContainer): void {
  for (const span of container.items.filter(item => item.attributes[GEN_AI_PROVIDER_NAME]?.value === 'aws.bedrock')) {
    for (const attribute of CONTENT_ATTRIBUTES) {
      expect(span.attributes[attribute]).toBeUndefined();
    }
  }
}

function assertStreamSpans(container: SerializedStreamedSpanContainer, recordsContent: boolean): void {
  const converseStreamSpan = findSpan(container, `chat ${MODEL_ID}`);
  expect(converseStreamSpan.status).toBe('ok');
  expect(converseStreamSpan.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
  expect(converseStreamSpan.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
  expect(converseStreamSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(12);
  expect(converseStreamSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(8);
  expect(converseStreamSpan.attributes[GEN_AI_RESPONSE_FINISH_REASONS].value).toBe('["tool_use"]');

  const invokeStreamSpan = findSpan(container, `generate_content ${MODEL_ID}`);
  expect(invokeStreamSpan.status).toBe('ok');
  expect(invokeStreamSpan.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');
  expect(invokeStreamSpan.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
  expect(invokeStreamSpan.attributes[GEN_AI_RESPONSE_ID].value).toBe('msg_bdrk_2');
  expect(invokeStreamSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(15);
  // The final count from `message_delta`, not the placeholder from `message_start`.
  expect(invokeStreamSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(9);
  expect(invokeStreamSpan.attributes[GEN_AI_RESPONSE_FINISH_REASONS].value).toBe('["end_turn"]');

  const failedStreamSpan = findSpan(container, 'chat amazon.nova-pro-v1:0');
  expect(failedStreamSpan.status).toBe('error');

  if (!recordsContent) {
    assertNoContent(container);
    return;
  }

  expect(converseStreamSpan.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe(SYSTEM_INSTRUCTIONS);
  expect(converseStreamSpan.attributes[GEN_AI_INPUT_MESSAGES].value).toBe(CONVERSE_INPUT_MESSAGES);
  expect(converseStreamSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value).toBe(CONVERSE_OUTPUT_MESSAGES);
  expect(invokeStreamSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value).toBe(
    JSON.stringify([
      { role: 'assistant', parts: [{ type: 'text', content: 'Streamed reply' }], finish_reason: 'end_turn' },
    ]),
  );
  // What streamed before the failure is kept.
  expect(failedStreamSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value).toBe(
    JSON.stringify([{ role: 'assistant', parts: [{ type: 'text', content: 'Partial' }] }]),
  );
}

describe('awsIntegration - Bedrock', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('auto-instruments Bedrock Converse and InvokeModel', { timeout: 90_000 }, async () => {
      await createTestRunner()
        .ignore('event')
        .expect({
          span: container => {
            assertBedrockSpans(container);
            assertNoContent(container);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createTestRunner, test) => {
    test('records prompts, tools, and responses when genAI data collection is on', { timeout: 90_000 }, async () => {
      await createTestRunner()
        .ignore('event')
        .expect({
          span: container => {
            assertBedrockSpans(container);
            assertBedrockContent(container);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-options.mjs', (createTestRunner, test) => {
    test('lets awsIntegration options override genAI data collection', { timeout: 90_000 }, async () => {
      await createTestRunner().ignore('event').expect({ span: assertBedrockContent }).start().completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-stream.mjs', 'instrument-with-pii.mjs', (createTestRunner, test) => {
    test(
      'records streamed responses and ends the spans when the streams finish or fail',
      { timeout: 90_000 },
      async () => {
        await createTestRunner()
          .ignore('event')
          .expect({ span: container => assertStreamSpans(container, true) })
          .start()
          .completed();
      },
    );
  });

  createEsmAndCjsTests(__dirname, 'scenario-stream.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('records no streamed content when genAI data collection is off', { timeout: 90_000 }, async () => {
      await createTestRunner()
        .ignore('event')
        .expect({ span: container => assertStreamSpans(container, false) })
        .start()
        .completed();
    });
  });
});
