import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_STREAMING_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
  OPENAI_RESPONSE_ID_ATTRIBUTE,
  OPENAI_RESPONSE_MODEL_ATTRIBUTE,
  OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE,
  OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
} from '../../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('OpenAI Tool Calls integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const WEATHER_TOOL_DEFINITION = JSON.stringify([
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the current weather in a given location',
        parameters: {
          type: 'object',
          properties: {
            latitude: { type: 'number', description: 'The latitude of the location' },
            longitude: { type: 'number', description: 'The longitude of the location' },
          },
          required: ['latitude', 'longitude'],
        },
      },
    },
  ]);

  const CHAT_TOOL_CALLS = JSON.stringify([
    {
      id: 'call_12345xyz',
      type: 'function',
      function: {
        name: 'get_weather',
        arguments: '{"latitude":48.8566,"longitude":2.3522}',
      },
    },
  ]);

  const CHAT_STREAM_TOOL_CALLS = JSON.stringify([
    {
      index: 0,
      id: 'call_12345xyz',
      type: 'function',
      function: {
        name: 'get_weather',
        arguments: '{"latitude":48.8566,"longitude":2.3522}',
      },
    },
  ]);

  const RESPONSES_TOOL_CALLS = JSON.stringify([
    {
      type: 'function_call',
      id: 'fc_12345xyz',
      call_id: 'call_12345xyz',
      name: 'get_weather',
      arguments: '{"latitude":48.8566,"longitude":2.3522}',
    },
  ]);

  const EXPECTED_TRANSACTION_DEFAULT_PII_FALSE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - chat completion with tools (non-streaming)
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: WEATHER_TOOL_DEFINITION,
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-tools-123',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["tool_calls"]',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 25,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 40,
          [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-tools-123',
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:31:40.000Z',
          [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 25,
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 15,
        },
        description: 'chat gpt-4',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Second span - chat completion with tools and streaming
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
          [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: WEATHER_TOOL_DEFINITION,
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-stream-tools-123',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["tool_calls"]',
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 25,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 40,
          [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-stream-tools-123',
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:31:45.000Z',
          [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 25,
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 15,
        },
        description: 'chat gpt-4 stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Third span - responses API with tools (non-streaming)
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: WEATHER_TOOL_DEFINITION,
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'resp_tools_789',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["completed"]',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 8,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 12,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 20,
          [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'resp_tools_789',
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:32:00.000Z',
          [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 12,
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 8,
        },
        description: 'chat gpt-4',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Fourth span - responses API with tools and streaming
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
          [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: WEATHER_TOOL_DEFINITION,
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'resp_stream_tools_789',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["in_progress","completed"]',
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 8,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 12,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 20,
          [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'resp_stream_tools_789',
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:31:50.000Z',
          [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 12,
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 8,
        },
        description: 'chat gpt-4 stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - chat completion with tools (non-streaming) with PII
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","content":"What is the weather like in Paris today?"}]',
          [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: WEATHER_TOOL_DEFINITION,
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-tools-123',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["tool_calls"]',
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: '[""]',
          [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: CHAT_TOOL_CALLS,
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 25,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 40,
          [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-tools-123',
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:31:40.000Z',
          [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 25,
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 15,
        },
        description: 'chat gpt-4',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Second span - chat completion with tools and streaming with PII
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","content":"What is the weather like in Paris today?"}]',
          [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: WEATHER_TOOL_DEFINITION,
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-stream-tools-123',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["tool_calls"]',
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: CHAT_STREAM_TOOL_CALLS,
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 25,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 40,
          [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-stream-tools-123',
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:31:45.000Z',
          [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 25,
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 15,
        },
        description: 'chat gpt-4 stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Third span - responses API with tools (non-streaming) with PII
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","content":"What is the weather like in Paris today?"}]',
          [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: WEATHER_TOOL_DEFINITION,
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'resp_tools_789',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["completed"]',
          [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: RESPONSES_TOOL_CALLS,
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 8,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 12,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 20,
          [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'resp_tools_789',
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:32:00.000Z',
          [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 12,
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 8,
        },
        description: 'chat gpt-4',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Fourth span - responses API with tools and streaming with PII
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","content":"What is the weather like in Paris today?"}]',
          [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: WEATHER_TOOL_DEFINITION,
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'resp_stream_tools_789',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["in_progress","completed"]',
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: RESPONSES_TOOL_CALLS,
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 8,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 12,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 20,
          [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'resp_stream_tools_789',
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:31:50.000Z',
          [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 12,
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 8,
        },
        description: 'chat gpt-4 stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates openai tool calls related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates openai tool calls related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE })
        .start()
        .completed();
    });
  });
});
