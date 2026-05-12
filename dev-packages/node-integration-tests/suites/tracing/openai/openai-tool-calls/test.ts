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
            const [firstSpan, secondSpan, thirdSpan, fourthSpan] = container.items;

            // [0] chat completion with tools (non-streaming)
            expect(firstSpan!.name).toBe('chat gpt-4');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
            expect(firstSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(firstSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(firstSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chatcmpl-tools-123',
            });
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["tool_calls"]',
            });
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 15 });
            expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 25 });
            expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 40 });

            // [1] chat completion with tools and streaming
            expect(secondSpan!.name).toBe('chat gpt-4');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
            expect(secondSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(secondSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(secondSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
            expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(secondSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({ type: 'boolean', value: true });
            expect(secondSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chatcmpl-stream-tools-123',
            });
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["tool_calls"]',
            });
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(secondSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 15 });
            expect(secondSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 25,
            });
            expect(secondSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 40 });

            // [2] responses API with tools (non-streaming)
            expect(thirdSpan!.name).toBe('chat gpt-4');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
            expect(thirdSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(thirdSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(thirdSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
            expect(thirdSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(thirdSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
            expect(thirdSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'resp_tools_789',
            });
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["completed"]',
            });
            expect(thirdSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 8 });
            expect(thirdSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 12 });
            expect(thirdSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 20 });

            // [3] responses API with tools and streaming
            expect(fourthSpan!.name).toBe('chat gpt-4');
            expect(fourthSpan!.status).toBe('ok');
            expect(fourthSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
            expect(fourthSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(fourthSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(fourthSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
            expect(fourthSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(fourthSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({ type: 'boolean', value: true });
            expect(fourthSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'resp_stream_tools_789',
            });
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["in_progress","completed"]',
            });
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(fourthSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 8 });
            expect(fourthSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 12,
            });
            expect(fourthSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 20 });
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
            const [firstSpan, secondSpan, thirdSpan, fourthSpan] = container.items;

            // [0] chat completion with tools (non-streaming) with PII
            expect(firstSpan!.name).toBe('chat gpt-4');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
            expect(firstSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(firstSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1,
            });
            expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"What is the weather like in Paris today?"}]',
            });
            expect(firstSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chatcmpl-tools-123',
            });
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["tool_calls"]',
            });
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toEqual({ type: 'string', value: '[""]' });
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: CHAT_TOOL_CALLS,
            });
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 15 });
            expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 25 });
            expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 40 });

            // [1] chat completion with tools and streaming with PII
            expect(secondSpan!.name).toBe('chat gpt-4');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
            expect(secondSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(secondSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(secondSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
            expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(secondSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({ type: 'boolean', value: true });
            expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1,
            });
            expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"What is the weather like in Paris today?"}]',
            });
            expect(secondSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chatcmpl-stream-tools-123',
            });
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["tool_calls"]',
            });
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: CHAT_STREAM_TOOL_CALLS,
            });
            expect(secondSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 15 });
            expect(secondSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 25,
            });
            expect(secondSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 40 });

            // [2] responses API with tools (non-streaming) with PII
            expect(thirdSpan!.name).toBe('chat gpt-4');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
            expect(thirdSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(thirdSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(thirdSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
            expect(thirdSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(thirdSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
            expect(thirdSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1,
            });
            expect(thirdSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"What is the weather like in Paris today?"}]',
            });
            expect(thirdSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'resp_tools_789',
            });
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["completed"]',
            });
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: RESPONSES_TOOL_CALLS,
            });
            expect(thirdSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 8 });
            expect(thirdSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 12 });
            expect(thirdSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 20 });

            // [3] responses API with tools and streaming with PII
            expect(fourthSpan!.name).toBe('chat gpt-4');
            expect(fourthSpan!.status).toBe('ok');
            expect(fourthSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
            expect(fourthSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(fourthSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(fourthSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
            expect(fourthSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(fourthSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({ type: 'boolean', value: true });
            expect(fourthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1,
            });
            expect(fourthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"What is the weather like in Paris today?"}]',
            });
            expect(fourthSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'resp_stream_tools_789',
            });
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["in_progress","completed"]',
            });
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: RESPONSES_TOOL_CALLS,
            });
            expect(fourthSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 8 });
            expect(fourthSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 12,
            });
            expect(fourthSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 20 });
          },
        })
        .start()
        .completed();
    });
  });
});
