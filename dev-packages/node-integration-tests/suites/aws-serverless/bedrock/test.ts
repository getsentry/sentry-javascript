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

const INPUT_ATTRIBUTES = [GEN_AI_SYSTEM_INSTRUCTIONS, GEN_AI_INPUT_MESSAGES, GEN_AI_TOOL_DEFINITIONS];
const OUTPUT_ATTRIBUTES = [GEN_AI_OUTPUT_MESSAGES, 'gen_ai.response.text', 'gen_ai.response.tool_calls'];

interface Recording {
  inputs: boolean;
  outputs: boolean;
}

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

function assertBedrockContent(container: SerializedStreamedSpanContainer, { inputs, outputs }: Recording): void {
  assertNoContent(container, { inputs: !inputs, outputs: !outputs });

  const converseSpan = findSpan(container, `chat ${MODEL_ID}`);
  const invokeModelSpan = findSpan(container, `generate_content ${MODEL_ID}`);

  if (inputs) {
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
    expect(invokeModelSpan.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe(SYSTEM_INSTRUCTIONS);
    // Inline image and document data is replaced with blob parts, also inside tool results.
    expect(invokeModelSpan.attributes[GEN_AI_INPUT_MESSAGES].value).toBe(
      JSON.stringify([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'blob', modality: 'image', mime_type: 'image/png' },
          ],
        },
        { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_report', input: {} }] },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_1',
              content: [{ type: 'blob', modality: 'document', mime_type: 'application/pdf' }],
            },
          ],
        },
      ]),
    );
    expect(JSON.stringify(invokeModelSpan.attributes)).not.toMatch(/iVBORw0K|JVBERi0x/);
  }

  if (outputs) {
    expect(converseSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value).toBe(CONVERSE_OUTPUT_MESSAGES);
    expect(invokeModelSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value).toBe(
      JSON.stringify([
        { role: 'assistant', parts: [{ type: 'text', content: 'Hello from Bedrock' }], finish_reason: 'end_turn' },
      ]),
    );
  }
}

/** Assert that the given kinds of content are absent from every Bedrock span. */
function assertNoContent(container: SerializedStreamedSpanContainer, absent: Recording): void {
  const attributes = [...(absent.inputs ? INPUT_ATTRIBUTES : []), ...(absent.outputs ? OUTPUT_ATTRIBUTES : [])];
  for (const span of container.items.filter(item => item.attributes[GEN_AI_PROVIDER_NAME]?.value === 'aws.bedrock')) {
    for (const attribute of attributes) {
      expect(span.attributes[attribute], `${span.name} ${attribute}`).toBeUndefined();
    }
  }
}

function assertStreamSpans(container: SerializedStreamedSpanContainer, { inputs, outputs }: Recording): void {
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

  assertNoContent(container, { inputs: !inputs, outputs: !outputs });

  if (inputs) {
    expect(converseStreamSpan.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe(SYSTEM_INSTRUCTIONS);
    expect(converseStreamSpan.attributes[GEN_AI_INPUT_MESSAGES].value).toBe(CONVERSE_INPUT_MESSAGES);
    expect(invokeStreamSpan.attributes[GEN_AI_INPUT_MESSAGES].value).toBe(
      JSON.stringify([{ role: 'user', content: 'Stream please' }]),
    );
  }

  if (outputs) {
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
}

// `GEN_AI_DATA_COLLECTION` sets `dataCollection.genAI`, `AWS_INTEGRATION_OPTIONS` sets `awsIntegration()` options.
const RECORDING_CASES: Array<{ name: string; env: Record<string, string>; expected: Recording }> = [
  { name: 'records inputs and outputs by default', env: {}, expected: { inputs: true, outputs: true } },
  {
    name: 'skips inputs when dataCollection.genAI.inputs is false',
    env: { GEN_AI_DATA_COLLECTION: '{"inputs":false}' },
    expected: { inputs: false, outputs: true },
  },
  {
    name: 'skips outputs when dataCollection.genAI.outputs is false',
    env: { GEN_AI_DATA_COLLECTION: '{"outputs":false}' },
    expected: { inputs: true, outputs: false },
  },
  {
    name: 'lets awsIntegration options turn on what dataCollection turns off',
    env: {
      GEN_AI_DATA_COLLECTION: '{"inputs":false,"outputs":false}',
      AWS_INTEGRATION_OPTIONS: '{"recordInputs":true,"recordOutputs":true}',
    },
    expected: { inputs: true, outputs: true },
  },
  {
    name: 'lets awsIntegration options turn off what dataCollection turns on',
    env: {
      GEN_AI_DATA_COLLECTION: '{"inputs":true,"outputs":true}',
      AWS_INTEGRATION_OPTIONS: '{"recordInputs":false}',
    },
    expected: { inputs: false, outputs: true },
  },
];

describe('awsIntegration - Bedrock', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('auto-instruments Bedrock Converse and InvokeModel', { timeout: 90_000 }, async () => {
      await createTestRunner()
        .ignore('event')
        .unordered()
        .expect({
          span: container => {
            assertBedrockSpans(container);
            assertNoContent(container, { inputs: true, outputs: true });
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-gen-ai.mjs', (createTestRunner, test) => {
    for (const { name, env, expected } of RECORDING_CASES) {
      test(name, { timeout: 90_000 }, async () => {
        await createTestRunner()
          .withEnv(env)
          .ignore('event')
          .unordered()
          .expect({
            span: container => {
              assertBedrockSpans(container);
              assertBedrockContent(container, expected);
            },
          })
          .start()
          .completed();
      });
    }
  });

  createEsmAndCjsTests(__dirname, 'scenario-stream.mjs', 'instrument-gen-ai.mjs', (createTestRunner, test) => {
    for (const { name, env, expected } of RECORDING_CASES) {
      test(
        `${name} when streaming, and ends the spans when the streams finish or fail`,
        { timeout: 90_000 },
        async () => {
          await createTestRunner()
            .withEnv(env)
            .ignore('event')
            .unordered()
            .expect({ span: container => assertStreamSpans(container, expected) })
            .start()
            .completed();
        },
      );
    }
  });

  createEsmAndCjsTests(__dirname, 'scenario-stream.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('records no streamed content when genAI data collection is off', { timeout: 90_000 }, async () => {
      await createTestRunner()
        .ignore('event')
        .unordered()
        .expect({ span: container => assertStreamSpans(container, { inputs: false, outputs: false }) })
        .start()
        .completed();
    });
  });
});
