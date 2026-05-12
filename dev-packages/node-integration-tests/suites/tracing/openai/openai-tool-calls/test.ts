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

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates openai tool calls related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(4);
            const chatToolsSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'chatcmpl-tools-123',
            );
            expect(chatToolsSpan).toBeDefined();
            expect(chatToolsSpan!.name).toBe('chat gpt-4');
            expect(chatToolsSpan!.status).toBe('ok');
            expect(chatToolsSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(chatToolsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(chatToolsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
            expect(chatToolsSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(chatToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chatcmpl-tools-123',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["tool_calls"]',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 15,
            });
            expect(chatToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 25,
            });
            expect(chatToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 40,
            });

            const streamingChatToolsSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'chatcmpl-stream-tools-123',
            );
            expect(streamingChatToolsSpan).toBeDefined();
            expect(streamingChatToolsSpan!.name).toBe('chat gpt-4');
            expect(streamingChatToolsSpan!.status).toBe('ok');
            expect(streamingChatToolsSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingChatToolsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingChatToolsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chatcmpl-stream-tools-123',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["tool_calls"]',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 15,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 25,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 40,
            });

            const responsesToolsSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'resp_tools_789',
            );
            expect(responsesToolsSpan).toBeDefined();
            expect(responsesToolsSpan!.name).toBe('chat gpt-4');
            expect(responsesToolsSpan!.status).toBe('ok');
            expect(responsesToolsSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(responsesToolsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(responsesToolsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
            expect(responsesToolsSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'resp_tools_789',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["completed"]',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 8,
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 12,
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 20,
            });

            const streamingResponsesToolsSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'resp_stream_tools_789',
            );
            expect(streamingResponsesToolsSpan).toBeDefined();
            expect(streamingResponsesToolsSpan!.name).toBe('chat gpt-4');
            expect(streamingResponsesToolsSpan!.status).toBe('ok');
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingResponsesToolsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingResponsesToolsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'resp_stream_tools_789',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["in_progress","completed"]',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 8,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 12,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 20,
            });
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates openai tool calls related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(4);
            const chatToolsSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'chatcmpl-tools-123',
            );
            expect(chatToolsSpan).toBeDefined();
            expect(chatToolsSpan!.name).toBe('chat gpt-4');
            expect(chatToolsSpan!.status).toBe('ok');
            expect(chatToolsSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(chatToolsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(chatToolsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
            expect(chatToolsSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1,
            });
            expect(chatToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"What is the weather like in Paris today?"}]',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(chatToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chatcmpl-tools-123',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["tool_calls"]',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '[""]',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: CHAT_TOOL_CALLS,
            });
            expect(chatToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 15,
            });
            expect(chatToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 25,
            });
            expect(chatToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 40,
            });

            const streamingChatToolsSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'chatcmpl-stream-tools-123',
            );
            expect(streamingChatToolsSpan).toBeDefined();
            expect(streamingChatToolsSpan!.name).toBe('chat gpt-4');
            expect(streamingChatToolsSpan!.status).toBe('ok');
            expect(streamingChatToolsSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingChatToolsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingChatToolsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"What is the weather like in Paris today?"}]',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chatcmpl-stream-tools-123',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["tool_calls"]',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: CHAT_STREAM_TOOL_CALLS,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 15,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 25,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 40,
            });

            const responsesToolsSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'resp_tools_789',
            );
            expect(responsesToolsSpan).toBeDefined();
            expect(responsesToolsSpan!.name).toBe('chat gpt-4');
            expect(responsesToolsSpan!.status).toBe('ok');
            expect(responsesToolsSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(responsesToolsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(responsesToolsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
            expect(responsesToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1,
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"What is the weather like in Paris today?"}]',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'resp_tools_789',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["completed"]',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: RESPONSES_TOOL_CALLS,
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 8,
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 12,
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 20,
            });

            const streamingResponsesToolsSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'resp_stream_tools_789',
            );
            expect(streamingResponsesToolsSpan).toBeDefined();
            expect(streamingResponsesToolsSpan!.name).toBe('chat gpt-4');
            expect(streamingResponsesToolsSpan!.status).toBe('ok');
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingResponsesToolsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingResponsesToolsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"What is the weather like in Paris today?"}]',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'resp_stream_tools_789',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["in_progress","completed"]',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: RESPONSES_TOOL_CALLS,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 8,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 12,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 20,
            });
          },
        })
        .start()
        .completed();
    });
  });
});
