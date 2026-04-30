import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_TOOL_CALL_ID_ATTRIBUTE,
  GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE,
  GEN_AI_TOOL_INPUT_ATTRIBUTE,
  GEN_AI_TOOL_NAME_ATTRIBUTE,
  GEN_AI_TOOL_OUTPUT_ATTRIBUTE,
  GEN_AI_TOOL_TYPE_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

/**
 * Helper to match a typed attribute value in a SerializedStreamedSpan.
 * Streamed span attributes are `{ value: X, type: Y }` objects, unlike transaction
 * span `data` which stores values directly.
 */
function attr(value: unknown) {
  return expect.objectContaining({ value });
}

describe('Vercel AI integration (streaming)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_SPANS_DEFAULT_PII_FALSE = {
    items: expect.arrayContaining([
      // First span - invoke_agent for simple generateText
      expect.objectContaining({
        name: 'invoke_agent',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: attr('mock-model-id'),
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: attr(10),
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: attr(20),
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: attr(30),
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: attr('invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr('auto.vercelai.otel'),
          'vercel.ai.pipeline.name': attr('generateText'),
          'vercel.ai.streaming': attr(false),
        }),
      }),
      // Second span - generate_content for simple generateText
      expect.objectContaining({
        name: 'generate_content mock-model-id',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: attr('mock-model-id'),
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: attr(10),
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: attr(20),
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: attr(30),
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: attr('generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr('auto.vercelai.otel'),
          'vercel.ai.pipeline.name': attr('generateText.doGenerate'),
          'vercel.ai.streaming': attr(false),
        }),
      }),
      // Third span - invoke_agent for explicit telemetry generateText
      expect.objectContaining({
        name: 'invoke_agent',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: attr(10),
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: attr(20),
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: attr(30),
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: attr('invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr('auto.vercelai.otel'),
        }),
      }),
      // Fourth span - tool call invoke_agent
      expect.objectContaining({
        name: 'invoke_agent',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: attr(15),
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: attr(25),
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: attr(40),
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: attr('invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr('auto.vercelai.otel'),
        }),
      }),
      // Fifth span - tool call generate_content
      expect.objectContaining({
        name: 'generate_content mock-model-id',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: attr(15),
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: attr(25),
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: attr(40),
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: attr('generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr('auto.vercelai.otel'),
        }),
      }),
      // Sixth span - execute_tool
      // Note: gen_ai.tool.description is NOT present when sendDefaultPii: false because ai.prompt.tools is not recorded
      expect.objectContaining({
        name: 'execute_tool getWeather',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: attr('call-1'),
          [GEN_AI_TOOL_NAME_ATTRIBUTE]: attr('getWeather'),
          [GEN_AI_TOOL_TYPE_ATTRIBUTE]: attr('function'),
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: attr('execute_tool'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.execute_tool'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr('auto.vercelai.otel'),
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
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: attr(1),
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: attr('[{"role":"user","content":"Where is the first span?"}]'),
          [GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]: attr(
            '[{"role":"assistant","parts":[{"type":"text","content":"First span here!"}],"finish_reason":"stop"}]',
          ),
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: attr('mock-model-id'),
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: attr(10),
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: attr(20),
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: attr(30),
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: attr('invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr('auto.vercelai.otel'),
          'vercel.ai.pipeline.name': attr('generateText'),
          'vercel.ai.streaming': attr(false),
        }),
      }),
      // Second span - generate_content with input/output messages
      expect.objectContaining({
        name: 'generate_content mock-model-id',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.objectContaining({ value: expect.any(String) }),
          [GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]: attr(
            '[{"role":"assistant","parts":[{"type":"text","content":"First span here!"}],"finish_reason":"stop"}]',
          ),
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: attr('mock-model-id'),
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: attr(10),
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: attr(20),
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: attr(30),
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: attr('generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr('auto.vercelai.otel'),
        }),
      }),
      // Third span - explicit telemetry invoke_agent with messages
      expect.objectContaining({
        name: 'invoke_agent',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: attr('[{"role":"user","content":"Where is the second span?"}]'),
          [GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]: attr(
            '[{"role":"assistant","parts":[{"type":"text","content":"Second span here!"}],"finish_reason":"stop"}]',
          ),
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: attr(10),
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: attr(20),
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: attr(30),
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: attr('invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr('auto.vercelai.otel'),
        }),
      }),
      // Fourth span - tool call invoke_agent with messages
      expect.objectContaining({
        name: 'invoke_agent',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: attr(
            '[{"role":"user","content":"What is the weather in San Francisco?"}]',
          ),
          [GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]: attr(
            '[{"role":"assistant","parts":[{"type":"text","content":"Tool call completed!"},{"type":"tool_call","id":"call-1","name":"getWeather","arguments":"{ \\"location\\": \\"San Francisco\\" }"}],"finish_reason":"tool_call"}]',
          ),
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: attr(15),
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: attr(25),
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: attr(40),
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: attr('invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr('auto.vercelai.otel'),
        }),
      }),
      // Fifth span - tool call generate_content with available_tools
      expect.objectContaining({
        name: 'generate_content mock-model-id',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: expect.objectContaining({
            value: expect.stringContaining('getWeather'),
          }),
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: attr(15),
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: attr(25),
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: attr(40),
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: attr('generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr('auto.vercelai.otel'),
        }),
      }),
      // Sixth span - execute_tool with description and input/output
      expect.objectContaining({
        name: 'execute_tool getWeather',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: attr('call-1'),
          [GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE]: attr('Get the current weather for a location'),
          [GEN_AI_TOOL_INPUT_ATTRIBUTE]: expect.objectContaining({ value: expect.any(String) }),
          [GEN_AI_TOOL_NAME_ATTRIBUTE]: attr('getWeather'),
          [GEN_AI_TOOL_OUTPUT_ATTRIBUTE]: expect.objectContaining({ value: expect.any(String) }),
          [GEN_AI_TOOL_TYPE_ATTRIBUTE]: attr('function'),
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: attr('execute_tool'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.execute_tool'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr('auto.vercelai.otel'),
        }),
      }),
    ]),
  };

  const EXPECTED_SPANS_ERROR_IN_TOOL = {
    items: expect.arrayContaining([
      expect.objectContaining({
        name: 'invoke_agent',
        status: 'error',
        attributes: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: attr(15),
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: attr(25),
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: attr(40),
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: attr('invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.invoke_agent'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr('auto.vercelai.otel'),
        }),
      }),
      expect.objectContaining({
        name: 'generate_content mock-model-id',
        status: 'ok',
        attributes: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: attr('mock-model-id'),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: attr(15),
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: attr(25),
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: attr(40),
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: attr('generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.generate_content'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr('auto.vercelai.otel'),
        }),
      }),
      expect.objectContaining({
        name: 'execute_tool getWeather',
        status: 'error',
        attributes: expect.objectContaining({
          [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: attr('call-1'),
          [GEN_AI_TOOL_NAME_ATTRIBUTE]: attr('getWeather'),
          [GEN_AI_TOOL_TYPE_ATTRIBUTE]: attr('function'),
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: attr('execute_tool'),
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: attr('gen_ai.execute_tool'),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: attr('auto.vercelai.otel'),
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates ai related spans in streaming mode with sendDefaultPii: false', async () => {
      await createRunner().expect({ span: EXPECTED_SPANS_DEFAULT_PII_FALSE }).start().completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates ai related spans in streaming mode with sendDefaultPii: true', async () => {
      await createRunner().expect({ span: EXPECTED_SPANS_DEFAULT_PII_TRUE }).start().completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-error-in-tool.mjs', 'instrument.mjs', (createRunner, test) => {
    test('normalizes error status in streaming mode', async () => {
      await createRunner().ignore('event').expect({ span: EXPECTED_SPANS_ERROR_IN_TOOL }).start().completed();
    });
  });

  // Truncation tests (moved from test.ts)

  const streamingLongContent = 'A'.repeat(50_000);

  createEsmAndCjsTests(__dirname, 'scenario-truncation.mjs', 'instrument.mjs', (createRunner, test) => {
    test('automatically disables truncation when span streaming is enabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            const spans = container.items;

            const chatSpan = spans.find(s =>
              s.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.includes(streamingLongContent),
            );
            expect(chatSpan).toBeDefined();
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-truncation.mjs', 'instrument-with-truncation.mjs', (createRunner, test) => {
    test('respects explicit enableTruncation: true even when span streaming is enabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            const spans = container.items;

            // With explicit enableTruncation: true, content should be truncated despite streaming.
            const chatSpan = spans.find(s =>
              s.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.startsWith('[{"role":"user","content":"AAAA'),
            );
            expect(chatSpan).toBeDefined();
            expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value.length).toBeLessThan(
              streamingLongContent.length,
            );
          },
        })
        .start()
        .completed();
    });
  });
});
