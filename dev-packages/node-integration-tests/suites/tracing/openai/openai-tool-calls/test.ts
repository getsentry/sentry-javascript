import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_REQUEST_STREAM_ATTRIBUTE } from '../../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
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
    test('creates openai tool calls related spans with genAI recording disabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            const segment = container.items.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
            expect(spans).toHaveLength(4);
            const chatToolsSpan = spans.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-tools-123',
            );
            expect(chatToolsSpan!.name).toBe('chat gpt-4');
            expect(chatToolsSpan!.status).toBe('ok');
            expect(chatToolsSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(chatToolsSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(chatToolsSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({ type: 'string', value: 'openai' });
            expect(chatToolsSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            // Tool definitions are gen AI input data, so `genAI.inputs: false` drops them.
            expect(chatToolsSpan!.attributes[GEN_AI_TOOL_DEFINITIONS]).toBeUndefined();
            expect(chatToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'chatcmpl-tools-123',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["tool_calls"]',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 15,
            });
            expect(chatToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 25,
            });
            expect(chatToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 40,
            });

            const streamingChatToolsSpan = spans.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-stream-tools-123',
            );
            expect(streamingChatToolsSpan!.name).toBe('chat gpt-4');
            expect(streamingChatToolsSpan!.status).toBe('ok');
            expect(streamingChatToolsSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingChatToolsSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingChatToolsSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_TOOL_DEFINITIONS]).toBeUndefined();
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'chatcmpl-stream-tools-123',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["tool_calls"]',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_STREAMING]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 15,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 25,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 40,
            });

            const responsesToolsSpan = spans.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'resp_tools_789',
            );
            expect(responsesToolsSpan!.name).toBe('chat gpt-4');
            expect(responsesToolsSpan!.status).toBe('ok');
            expect(responsesToolsSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(responsesToolsSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(responsesToolsSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
            expect(responsesToolsSpan!.attributes[GEN_AI_TOOL_DEFINITIONS]).toBeUndefined();
            expect(responsesToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'resp_tools_789',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["completed"]',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 8,
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 12,
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 20,
            });

            const streamingResponsesToolsSpan = spans.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'resp_stream_tools_789',
            );
            expect(streamingResponsesToolsSpan!.name).toBe('chat gpt-4');
            expect(streamingResponsesToolsSpan!.status).toBe('ok');
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingResponsesToolsSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingResponsesToolsSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_TOOL_DEFINITIONS]).toBeUndefined();
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'resp_stream_tools_789',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["in_progress","completed"]',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_STREAMING]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 8,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 12,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
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
    test('creates openai tool calls related spans with genAI recording enabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            const segment = container.items.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
            expect(spans).toHaveLength(4);
            const chatToolsSpan = spans.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-tools-123',
            );
            expect(chatToolsSpan!.name).toBe('chat gpt-4');
            expect(chatToolsSpan!.status).toBe('ok');
            expect(chatToolsSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(chatToolsSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(chatToolsSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({ type: 'string', value: 'openai' });
            expect(chatToolsSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"What is the weather like in Paris today?"}]',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_TOOL_DEFINITIONS]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(chatToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'chatcmpl-tools-123',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["tool_calls"]',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toEqual({
              type: 'string',
              value: '[""]',
            });
            expect(chatToolsSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS]).toEqual({
              type: 'string',
              value: CHAT_TOOL_CALLS,
            });
            expect(chatToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 15,
            });
            expect(chatToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 25,
            });
            expect(chatToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 40,
            });

            const streamingChatToolsSpan = spans.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-stream-tools-123',
            );
            expect(streamingChatToolsSpan!.name).toBe('chat gpt-4');
            expect(streamingChatToolsSpan!.status).toBe('ok');
            expect(streamingChatToolsSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingChatToolsSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingChatToolsSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"What is the weather like in Paris today?"}]',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_TOOL_DEFINITIONS]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'chatcmpl-stream-tools-123',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["tool_calls"]',
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_STREAMING]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS]).toEqual({
              type: 'string',
              value: CHAT_STREAM_TOOL_CALLS,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 15,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 25,
            });
            expect(streamingChatToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 40,
            });

            const responsesToolsSpan = spans.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'resp_tools_789',
            );
            expect(responsesToolsSpan!.name).toBe('chat gpt-4');
            expect(responsesToolsSpan!.status).toBe('ok');
            expect(responsesToolsSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(responsesToolsSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(responsesToolsSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
            expect(responsesToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"What is the weather like in Paris today?"}]',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_TOOL_DEFINITIONS]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'resp_tools_789',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["completed"]',
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS]).toEqual({
              type: 'string',
              value: RESPONSES_TOOL_CALLS,
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 8,
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 12,
            });
            expect(responsesToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 20,
            });

            const streamingResponsesToolsSpan = spans.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'resp_stream_tools_789',
            );
            expect(streamingResponsesToolsSpan!.name).toBe('chat gpt-4');
            expect(streamingResponsesToolsSpan!.status).toBe('ok');
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingResponsesToolsSpan!.attributes[SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingResponsesToolsSpan!.attributes[SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_PROVIDER_NAME]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"What is the weather like in Paris today?"}]',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_TOOL_DEFINITIONS]).toEqual({
              type: 'string',
              value: WEATHER_TOOL_DEFINITION,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_ID]).toEqual({
              type: 'string',
              value: 'resp_stream_tools_789',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toEqual({
              type: 'string',
              value: '["in_progress","completed"]',
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_STREAMING]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS]).toEqual({
              type: 'string',
              value: RESPONSES_TOOL_CALLS,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 8,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 12,
            });
            expect(streamingResponsesToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
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
