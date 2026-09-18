import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

/**
 * Helper to match a typed attribute value in a SerializedStreamedSpan.
 * Streamed span attributes are `{ value: X, type: Y }` objects, unlike transaction
 * span `data` which stores values directly.
 */
function attr(value: unknown) {
  return expect.objectContaining({ value });
}

describe('Vercel AI integration (streaming, v6)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const origin = 'auto.vercelai.channel';

  const EXPECTED_SPANS_DEFAULT_PII_FALSE = {
    items: expect.arrayContaining([
      // First span - invoke_agent for simple generateText
      expect.objectContaining({
        name: 'invoke_agent',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL]: attr('mock-model-id'),
          [GEN_AI_RESPONSE_MODEL]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS]: attr(10),
          [GEN_AI_USAGE_OUTPUT_TOKENS]: attr(20),
          [GEN_AI_USAGE_TOTAL_TOKENS]: attr(30),
          [GEN_AI_OPERATION_NAME]: attr('invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr(origin),
        }),
      }),
      // Second span - generate_content for simple generateText
      expect.objectContaining({
        name: 'generate_content mock-model-id',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL]: attr('mock-model-id'),
          [GEN_AI_RESPONSE_MODEL]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS]: attr(10),
          [GEN_AI_USAGE_OUTPUT_TOKENS]: attr(20),
          [GEN_AI_USAGE_TOTAL_TOKENS]: attr(30),
          [GEN_AI_OPERATION_NAME]: attr('generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr(origin),
        }),
      }),
      // Third span - invoke_agent for explicit telemetry generateText
      expect.objectContaining({
        name: 'invoke_agent',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS]: attr(10),
          [GEN_AI_USAGE_OUTPUT_TOKENS]: attr(20),
          [GEN_AI_USAGE_TOTAL_TOKENS]: attr(30),
          [GEN_AI_OPERATION_NAME]: attr('invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr(origin),
        }),
      }),
      // Fourth span - tool call invoke_agent
      expect.objectContaining({
        name: 'invoke_agent',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS]: attr(15),
          [GEN_AI_USAGE_OUTPUT_TOKENS]: attr(25),
          [GEN_AI_USAGE_TOTAL_TOKENS]: attr(40),
          [GEN_AI_OPERATION_NAME]: attr('invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr(origin),
        }),
      }),
      // Fifth span - tool call generate_content
      expect.objectContaining({
        name: 'generate_content mock-model-id',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS]: attr(15),
          [GEN_AI_USAGE_OUTPUT_TOKENS]: attr(25),
          [GEN_AI_USAGE_TOTAL_TOKENS]: attr(40),
          [GEN_AI_OPERATION_NAME]: attr('generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr(origin),
        }),
      }),
      // Sixth span - execute_tool
      // Note: gen_ai.tool.description is NOT present when genAI recording disabled because ai.prompt.tools is not recorded
      expect.objectContaining({
        name: 'execute_tool getWeather',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: attr('call-1'),
          [GEN_AI_TOOL_NAME]: attr('getWeather'),
          [GEN_AI_OPERATION_NAME]: attr('execute_tool'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.execute_tool'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr(origin),
        }),
      }),
    ]),
  };

  const EXPECTED_SPANS_DEFAULT_PII_TRUE = {
    items: expect.arrayContaining([
      // First span - invoke_agent with input/output messages (PII enabled)
      expect.objectContaining({
        name: 'invoke_agent',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_INPUT_MESSAGES]: attr('[{"role":"user","content":"Where is the first span?"}]'),
          [GEN_AI_OUTPUT_MESSAGES]: attr(
            '[{"role":"assistant","parts":[{"type":"text","content":"First span here!"}],"finish_reason":"stop"}]',
          ),
          [GEN_AI_REQUEST_MODEL]: attr('mock-model-id'),
          [GEN_AI_RESPONSE_MODEL]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS]: attr(10),
          [GEN_AI_USAGE_OUTPUT_TOKENS]: attr(20),
          [GEN_AI_USAGE_TOTAL_TOKENS]: attr(30),
          [GEN_AI_OPERATION_NAME]: attr('invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr(origin),
        }),
      }),
      // Second span - generate_content with input/output messages
      expect.objectContaining({
        name: 'generate_content mock-model-id',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_INPUT_MESSAGES]: expect.objectContaining({ value: expect.any(String) }),
          [GEN_AI_OUTPUT_MESSAGES]: attr(
            '[{"role":"assistant","parts":[{"type":"text","content":"First span here!"}],"finish_reason":"stop"}]',
          ),
          [GEN_AI_REQUEST_MODEL]: attr('mock-model-id'),
          [GEN_AI_RESPONSE_MODEL]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS]: attr(10),
          [GEN_AI_USAGE_OUTPUT_TOKENS]: attr(20),
          [GEN_AI_USAGE_TOTAL_TOKENS]: attr(30),
          [GEN_AI_OPERATION_NAME]: attr('generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr(origin),
        }),
      }),
      // Third span - explicit telemetry invoke_agent with messages
      expect.objectContaining({
        name: 'invoke_agent',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_INPUT_MESSAGES]: attr('[{"role":"user","content":"Where is the second span?"}]'),
          [GEN_AI_OUTPUT_MESSAGES]: attr(
            '[{"role":"assistant","parts":[{"type":"text","content":"Second span here!"}],"finish_reason":"stop"}]',
          ),
          [GEN_AI_REQUEST_MODEL]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS]: attr(10),
          [GEN_AI_USAGE_OUTPUT_TOKENS]: attr(20),
          [GEN_AI_USAGE_TOTAL_TOKENS]: attr(30),
          [GEN_AI_OPERATION_NAME]: attr('invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr(origin),
        }),
      }),
      // Fourth span - tool call invoke_agent with messages (V6: no text part, only tool_call)
      expect.objectContaining({
        name: 'invoke_agent',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_INPUT_MESSAGES]: attr('[{"role":"user","content":"What is the weather in San Francisco?"}]'),
          [GEN_AI_OUTPUT_MESSAGES]: attr(
            '[{"role":"assistant","parts":[{"type":"tool_call","id":"call-1","name":"getWeather","arguments":"{\\"location\\":\\"San Francisco\\"}"}],"finish_reason":"tool_call"}]',
          ),
          [GEN_AI_REQUEST_MODEL]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS]: attr(15),
          [GEN_AI_USAGE_OUTPUT_TOKENS]: attr(25),
          [GEN_AI_USAGE_TOTAL_TOKENS]: attr(40),
          [GEN_AI_OPERATION_NAME]: attr('invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr(origin),
        }),
      }),
      // Fifth span - tool call generate_content with tool definitions
      expect.objectContaining({
        name: 'generate_content mock-model-id',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_TOOL_DEFINITIONS]: expect.objectContaining({
            value: expect.stringContaining('getWeather'),
          }),
          [GEN_AI_REQUEST_MODEL]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS]: attr(15),
          [GEN_AI_USAGE_OUTPUT_TOKENS]: attr(25),
          [GEN_AI_USAGE_TOTAL_TOKENS]: attr(40),
          [GEN_AI_OPERATION_NAME]: attr('generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr(origin),
        }),
      }),
      // Sixth span - execute_tool with description and input/output
      expect.objectContaining({
        name: 'execute_tool getWeather',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: attr('call-1'),
          [GEN_AI_TOOL_DESCRIPTION]: attr('Get the current weather for a location'),
          [GEN_AI_TOOL_CALL_ARGUMENTS]: expect.objectContaining({ value: expect.any(String) }),
          [GEN_AI_TOOL_NAME]: attr('getWeather'),
          [GEN_AI_TOOL_CALL_RESULT]: expect.objectContaining({ value: expect.any(String) }),
          [GEN_AI_OPERATION_NAME]: attr('execute_tool'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.execute_tool'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr(origin),
        }),
      }),
    ]),
  };

  const EXPECTED_SPANS_ERROR_IN_TOOL = {
    items: expect.arrayContaining([
      expect.objectContaining({
        name: 'invoke_agent',
        attributes: expect.objectContaining({
          [GEN_AI_OPERATION_NAME]: attr('invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr(origin),
        }),
      }),
      expect.objectContaining({
        name: 'generate_content mock-model-id',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS]: attr(15),
          [GEN_AI_USAGE_OUTPUT_TOKENS]: attr(25),
          [GEN_AI_USAGE_TOTAL_TOKENS]: attr(40),
          [GEN_AI_OPERATION_NAME]: attr('generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr(origin),
        }),
      }),
      expect.objectContaining({
        name: 'execute_tool getWeather',
        status: 'error',
        attributes: expect.objectContaining({
          [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: attr('call-1'),
          [GEN_AI_TOOL_NAME]: attr('getWeather'),
          [GEN_AI_OPERATION_NAME]: attr('execute_tool'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.execute_tool'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr(origin),
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates ai related spans in streaming mode with genAI recording disabled', async () => {
        await createRunner().expect({ span: EXPECTED_SPANS_DEFAULT_PII_FALSE }).start().completed();
      });
    },
    {
      additionalDependencies: {
        ai: '^6.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('creates ai related spans in streaming mode with genAI recording enabled', async () => {
        await createRunner().expect({ span: EXPECTED_SPANS_DEFAULT_PII_TRUE }).start().completed();
      });
    },
    {
      additionalDependencies: {
        ai: '^6.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-error-in-tool.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('normalizes error status in streaming mode', async () => {
        await createRunner().ignore('event').expect({ span: EXPECTED_SPANS_ERROR_IN_TOOL }).start().completed();
      });
    },
    {
      additionalDependencies: {
        ai: '^6.0.0',
      },
    },
  );
});
