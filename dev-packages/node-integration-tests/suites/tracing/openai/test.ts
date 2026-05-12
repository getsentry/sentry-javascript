import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_CONVERSATION_ID_ATTRIBUTE,
  GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE,
  GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_STREAMING_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('OpenAI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario-chat.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates openai related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(6);
            const chatCompletionSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'chatcmpl-mock123',
            );
            expect(chatCompletionSpan).toBeDefined();
            expect(chatCompletionSpan!.name).toBe('chat gpt-3.5-turbo');
            expect(chatCompletionSpan!.status).toBe('ok');
            expect(chatCompletionSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(chatCompletionSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(chatCompletionSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]).toEqual({
              type: 'double',
              value: 0.7,
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chatcmpl-mock123',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["stop"]',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 15,
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 25,
            });

            const responsesSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'resp_mock456',
            );
            expect(responsesSpan).toBeDefined();
            expect(responsesSpan!.name).toBe('chat gpt-3.5-turbo');
            expect(responsesSpan!.status).toBe('ok');
            expect(responsesSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(responsesSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(responsesSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(responsesSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
            expect(responsesSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(responsesSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(responsesSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'resp_mock456',
            });
            expect(responsesSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["completed"]',
            });
            expect(responsesSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 5,
            });
            expect(responsesSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 8,
            });
            expect(responsesSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 13,
            });

            const nonStreamingErrorSpan = container.items.find(
              span =>
                span.name === 'chat error-model' && span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] === undefined,
            );
            expect(nonStreamingErrorSpan).toBeDefined();
            expect(nonStreamingErrorSpan!.name).toBe('chat error-model');
            expect(nonStreamingErrorSpan!.status).toBe('error');
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(nonStreamingErrorSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(nonStreamingErrorSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'error-model',
            });

            const streamingChatCompletionSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'chatcmpl-stream-123',
            );
            expect(streamingChatCompletionSpan).toBeDefined();
            expect(streamingChatCompletionSpan!.name).toBe('chat gpt-4');
            expect(streamingChatCompletionSpan!.status).toBe('ok');
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingChatCompletionSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingChatCompletionSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]).toEqual({
              type: 'double',
              value: 0.8,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chatcmpl-stream-123',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["stop"]',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 12,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 18,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 30,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });

            const streamingResponsesSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'resp_stream_456',
            );
            expect(streamingResponsesSpan).toBeDefined();
            expect(streamingResponsesSpan!.name).toBe('chat gpt-4');
            expect(streamingResponsesSpan!.status).toBe('ok');
            expect(streamingResponsesSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingResponsesSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingResponsesSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'resp_stream_456',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["in_progress","completed"]',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 6,
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 16,
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });

            const streamingErrorSpan = container.items.find(
              span =>
                span.name === 'chat error-model' && span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]?.value === true,
            );
            expect(streamingErrorSpan).toBeDefined();
            expect(streamingErrorSpan!.name).toBe('chat error-model');
            expect(streamingErrorSpan!.status).toBe('error');
            expect(streamingErrorSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingErrorSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'error-model',
            });
            expect(streamingErrorSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingErrorSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingErrorSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingErrorSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-chat.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates openai related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(6);
            const chatCompletionSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'chatcmpl-mock123',
            );
            expect(chatCompletionSpan).toBeDefined();
            expect(chatCompletionSpan!.name).toBe('chat gpt-3.5-turbo');
            expect(chatCompletionSpan!.status).toBe('ok');
            expect(chatCompletionSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(chatCompletionSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(chatCompletionSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]).toEqual({
              type: 'double',
              value: 0.7,
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1,
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"What is the capital of France?"}]',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: JSON.stringify([{ type: 'text', content: 'You are a helpful assistant.' }]),
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chatcmpl-mock123',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["stop"]',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["Hello from OpenAI mock!"]',
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 15,
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 25,
            });

            const responsesSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'resp_mock456',
            );
            expect(responsesSpan).toBeDefined();
            expect(responsesSpan!.name).toBe('chat gpt-3.5-turbo');
            expect(responsesSpan!.status).toBe('ok');
            expect(responsesSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(responsesSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(responsesSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(responsesSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
            expect(responsesSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(responsesSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1,
            });
            expect(responsesSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'Translate this to French: Hello',
            });
            expect(responsesSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'Response to: Translate this to French: Hello',
            });
            expect(responsesSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["completed"]',
            });
            expect(responsesSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-3.5-turbo',
            });
            expect(responsesSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'resp_mock456',
            });
            expect(responsesSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 5,
            });
            expect(responsesSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 8,
            });
            expect(responsesSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 13,
            });

            const nonStreamingErrorSpan = container.items.find(
              span =>
                span.name === 'chat error-model' && span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] === undefined,
            );
            expect(nonStreamingErrorSpan).toBeDefined();
            expect(nonStreamingErrorSpan!.name).toBe('chat error-model');
            expect(nonStreamingErrorSpan!.status).toBe('error');
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(nonStreamingErrorSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(nonStreamingErrorSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'error-model',
            });
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1,
            });
            expect(nonStreamingErrorSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"This will fail"}]',
            });

            const streamingChatCompletionSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'chatcmpl-stream-123',
            );
            expect(streamingChatCompletionSpan).toBeDefined();
            expect(streamingChatCompletionSpan!.name).toBe('chat gpt-4');
            expect(streamingChatCompletionSpan!.status).toBe('ok');
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingChatCompletionSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingChatCompletionSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]).toEqual({
              type: 'double',
              value: 0.8,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"Tell me about streaming"}]',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: JSON.stringify([{ type: 'text', content: 'You are a helpful assistant.' }]),
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'Hello from OpenAI streaming!',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["stop"]',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chatcmpl-stream-123',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 12,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 18,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 30,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });

            const streamingResponsesSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'resp_stream_456',
            );
            expect(streamingResponsesSpan).toBeDefined();
            expect(streamingResponsesSpan!.name).toBe('chat gpt-4');
            expect(streamingResponsesSpan!.status).toBe('ok');
            expect(streamingResponsesSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingResponsesSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingResponsesSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1,
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'Test streaming responses API',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'Streaming response to: Test streaming responses APITest streaming responses API',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["in_progress","completed"]',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'resp_stream_456',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 6,
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 16,
            });
            expect(streamingResponsesSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });

            const streamingErrorSpan = container.items.find(
              span =>
                span.name === 'chat error-model' && span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]?.value === true,
            );
            expect(streamingErrorSpan).toBeDefined();
            expect(streamingErrorSpan!.name).toBe('chat error-model');
            expect(streamingErrorSpan!.status).toBe('error');
            expect(streamingErrorSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(streamingErrorSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'error-model',
            });
            expect(streamingErrorSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingErrorSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1,
            });
            expect(streamingErrorSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"This will fail"}]',
            });
            expect(streamingErrorSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(streamingErrorSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(streamingErrorSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-chat.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('creates openai related spans with custom options', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(6);
            const chatCompletionSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'chatcmpl-mock123',
            );
            expect(chatCompletionSpan).toBeDefined();
            expect(chatCompletionSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
            expect(chatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toMatchObject({
              type: 'string',
              value: expect.any(String),
            });
            expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toMatchObject({
              type: 'string',
              value: expect.any(String),
            });

            const streamingChatCompletionSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'chatcmpl-stream-123',
            );
            expect(streamingChatCompletionSpan).toBeDefined();
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toMatchObject({
              type: 'string',
              value: expect.any(String),
            });
            expect(streamingChatCompletionSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toMatchObject({
              type: 'string',
              value: expect.any(String),
            });
          },
        })
        .start()
        .completed();
    });
  });

  const longContent = 'A'.repeat(50_000);

  createEsmAndCjsTests(
    __dirname,
    'scenario-no-truncation.mjs',
    'instrument-no-truncation.mjs',
    (createRunner, test) => {
      test('does not truncate input messages when enableTruncation is false', async () => {
        await createRunner()
          .ignore('event')
          .expect({
            transaction: {
              transaction: 'main',
            },
          })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(2);
              const chatCompletionSpan = container.items.find(
                span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'chatcmpl-mock123',
              );
              expect(chatCompletionSpan).toBeDefined();
              expect(chatCompletionSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'chatcmpl-mock123',
              });
              expect(chatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toMatchObject({
                type: 'string',
                value: JSON.stringify([
                  { role: 'user', content: longContent },
                  { role: 'assistant', content: 'Some reply' },
                  { role: 'user', content: 'Follow-up question' },
                ]),
              });
              expect(chatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toMatchObject({
                type: 'integer',
                value: 3,
              });

              const responsesSpan = container.items.find(
                span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'resp_mock456',
              );
              expect(responsesSpan).toBeDefined();
              expect(responsesSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'resp_mock456',
              });
              expect(responsesSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toMatchObject({
                type: 'string',
                value: 'B'.repeat(50_000),
              });
              expect(responsesSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toMatchObject({
                type: 'integer',
                value: 1,
              });
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates openai related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({
          transaction: {
            transaction: 'main',
          },
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const singleEmbeddingSpan = container.items.find(
              span =>
                span.name === 'embeddings text-embedding-3-small' &&
                span.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE] !== undefined,
            );
            expect(singleEmbeddingSpan).toBeDefined();
            expect(singleEmbeddingSpan!.name).toBe('embeddings text-embedding-3-small');
            expect(singleEmbeddingSpan!.status).toBe('ok');
            expect(singleEmbeddingSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'embeddings',
            });
            expect(singleEmbeddingSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.embeddings',
            });
            expect(singleEmbeddingSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'float',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1536,
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 10,
            });

            const errorEmbeddingSpan = container.items.find(span => span.name === 'embeddings error-model');
            expect(errorEmbeddingSpan).toBeDefined();
            expect(errorEmbeddingSpan!.name).toBe('embeddings error-model');
            expect(errorEmbeddingSpan!.status).toBe('error');
            expect(errorEmbeddingSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'embeddings',
            });
            expect(errorEmbeddingSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.embeddings',
            });
            expect(errorEmbeddingSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(errorEmbeddingSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(errorEmbeddingSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'error-model',
            });

            const multiEmbeddingSpan = container.items.find(
              span =>
                span.name === 'embeddings text-embedding-3-small' &&
                span.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE] === undefined,
            );
            expect(multiEmbeddingSpan).toBeDefined();
            expect(multiEmbeddingSpan!.name).toBe('embeddings text-embedding-3-small');
            expect(multiEmbeddingSpan!.status).toBe('ok');
            expect(multiEmbeddingSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'embeddings',
            });
            expect(multiEmbeddingSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.embeddings',
            });
            expect(multiEmbeddingSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 10,
            });
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates openai related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({
          transaction: {
            transaction: 'main',
          },
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const singleEmbeddingSpan = container.items.find(
              span => span.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]?.value === 'Embedding test!',
            );
            expect(singleEmbeddingSpan).toBeDefined();
            expect(singleEmbeddingSpan!.name).toBe('embeddings text-embedding-3-small');
            expect(singleEmbeddingSpan!.status).toBe('ok');
            expect(singleEmbeddingSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'embeddings',
            });
            expect(singleEmbeddingSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.embeddings',
            });
            expect(singleEmbeddingSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'float',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 1536,
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'Embedding test!',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(singleEmbeddingSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 10,
            });

            const errorEmbeddingSpan = container.items.find(
              span => span.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]?.value === 'Error embedding test!',
            );
            expect(errorEmbeddingSpan).toBeDefined();
            expect(errorEmbeddingSpan!.name).toBe('embeddings error-model');
            expect(errorEmbeddingSpan!.status).toBe('error');
            expect(errorEmbeddingSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'embeddings',
            });
            expect(errorEmbeddingSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.embeddings',
            });
            expect(errorEmbeddingSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(errorEmbeddingSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(errorEmbeddingSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'error-model',
            });
            expect(errorEmbeddingSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'Error embedding test!',
            });

            const multiEmbeddingSpan = container.items.find(
              span =>
                span.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]?.value ===
                '["First input text","Second input text","Third input text"]',
            );
            expect(multiEmbeddingSpan).toBeDefined();
            expect(multiEmbeddingSpan!.name).toBe('embeddings text-embedding-3-small');
            expect(multiEmbeddingSpan!.status).toBe('ok');
            expect(multiEmbeddingSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'embeddings',
            });
            expect(multiEmbeddingSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.embeddings',
            });
            expect(multiEmbeddingSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["First input text","Second input text","Third input text"]',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'text-embedding-3-small',
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(multiEmbeddingSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 10,
            });
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-root-span.mjs', 'instrument-root-span.mjs', (createRunner, test) => {
    test('it works without a wrapping span', async () => {
      await createRunner()
        // First the span that our mock express server is emitting, unrelated to this test
        .expect({
          transaction: {
            transaction: 'POST /openai/chat/completions',
          },
        })
        .expect({
          transaction: {
            transaction: 'chat gpt-3.5-turbo',
            contexts: {
              trace: {
                span_id: expect.any(String),
                trace_id: expect.any(String),
                data: {
                  [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
                  [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
                  [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
                  [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.7,
                  [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
                  [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-mock123',
                  [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["stop"]',
                  [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
                  [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 15,
                  [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 25,
                },
                op: 'gen_ai.chat',
                origin: 'auto.ai.openai',
                status: 'ok',
              },
            },
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-azure-openai.mjs', 'instrument.mjs', (createRunner, test) => {
    test('it works with Azure OpenAI', async () => {
      await createRunner()
        // First the span that our mock express server is emitting, unrelated to this test
        .expect({
          transaction: {
            transaction: 'POST /azureopenai/deployments/:model/chat/completions',
          },
        })
        .expect({
          transaction: {
            transaction: 'chat gpt-3.5-turbo',
            contexts: {
              trace: {
                span_id: expect.any(String),
                trace_id: expect.any(String),
                data: {
                  [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
                  [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
                  [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
                  [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.7,
                  [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
                  [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-mock123',
                  [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["stop"]',
                  [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
                  [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 15,
                  [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 25,
                },
                op: 'gen_ai.chat',
                origin: 'auto.ai.openai',
                status: 'ok',
              },
            },
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'truncation/scenario-message-truncation-completions.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('truncates messages when they exceed byte limit - keeps only last message and crops it', async () => {
        await createRunner()
          .ignore('event')
          .expect({
            transaction: {
              transaction: 'main',
            },
          })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(2);
              const truncatedMessageSpan = container.items.find(span =>
                span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.match(
                  /^\[\{"role":"user","content":"C+"\}\]$/,
                ),
              );
              expect(truncatedMessageSpan).toBeDefined();
              expect(truncatedMessageSpan!.name).toBe('chat gpt-3.5-turbo');
              expect(truncatedMessageSpan!.status).toBe('ok');
              expect(truncatedMessageSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'chat',
              });
              expect(truncatedMessageSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.chat',
              });
              expect(truncatedMessageSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: 'auto.ai.openai',
              });
              expect(truncatedMessageSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'openai',
              });
              expect(truncatedMessageSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'gpt-3.5-turbo',
              });
              expect(truncatedMessageSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 2,
              });
              expect(truncatedMessageSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toMatch(
                /^\[\{"role":"user","content":"C+"\}\]$/,
              );
              expect(truncatedMessageSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE].value).toMatch(
                /^\[\{"type":"text","content":"A+"\}\]$/,
              );

              const smallMessageSpan = container.items.find(
                span =>
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value ===
                  JSON.stringify([{ role: 'user', content: 'This is a small message that fits within the limit' }]),
              );
              expect(smallMessageSpan).toBeDefined();
              expect(smallMessageSpan!.name).toBe('chat gpt-3.5-turbo');
              expect(smallMessageSpan!.status).toBe('ok');
              expect(smallMessageSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'chat',
              });
              expect(smallMessageSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.chat',
              });
              expect(smallMessageSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: 'auto.ai.openai',
              });
              expect(smallMessageSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'openai',
              });
              expect(smallMessageSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'gpt-3.5-turbo',
              });
              expect(smallMessageSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
                type: 'string',
                value: JSON.stringify([
                  { role: 'user', content: 'This is a small message that fits within the limit' },
                ]),
              });
              expect(smallMessageSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 2,
              });
              expect(smallMessageSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE].value).toMatch(
                /^\[\{"type":"text","content":"A+"\}\]$/,
              );
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'truncation/scenario-message-truncation-responses.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('truncates string inputs when they exceed byte limit', async () => {
        await createRunner()
          .ignore('event')
          .expect({
            transaction: {
              transaction: 'main',
            },
          })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(1);
              const [firstSpan] = container.items;

              // [0] long A-string input is truncated
              expect(firstSpan!.name).toBe('chat gpt-3.5-turbo');
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
              expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'gpt-3.5-turbo',
              });
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 1,
              });
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toMatch(/^A+$/);
            },
          })
          .start()
          .completed();
      });
    },
  );

  // Test for conversation ID support (Conversations API and previous_response_id)
  createEsmAndCjsTests(__dirname, 'scenario-conversation.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures conversation ID from Conversations API and previous_response_id', async () => {
      await createRunner()
        .ignore('event')
        .expect({
          transaction: {
            transaction: 'conversation-test',
          },
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(4);
            const conversationCreateSpan = container.items.find(span => span.name === 'chat unknown');
            expect(conversationCreateSpan).toBeDefined();
            expect(conversationCreateSpan!.name).toBe('chat unknown');
            expect(conversationCreateSpan!.status).toBe('ok');
            expect(conversationCreateSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(conversationCreateSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(conversationCreateSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(conversationCreateSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(conversationCreateSpan!.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'conv_689667905b048191b4740501625afd940c7533ace33a2dab',
            });

            const conversationResponseSpan = container.items.find(
              span =>
                span.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE]?.value ===
                  'conv_689667905b048191b4740501625afd940c7533ace33a2dab' &&
                span.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]?.value === 'gpt-4',
            );
            expect(conversationResponseSpan).toBeDefined();
            expect(conversationResponseSpan!.status).toBe('ok');
            expect(conversationResponseSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(conversationResponseSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(conversationResponseSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(conversationResponseSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(conversationResponseSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(conversationResponseSpan!.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'conv_689667905b048191b4740501625afd940c7533ace33a2dab',
            });

            const unlinkedResponseSpan = container.items.find(
              span =>
                span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]?.value === 'gen_ai.chat' &&
                span.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE] === undefined,
            );
            expect(unlinkedResponseSpan).toBeDefined();
            expect(unlinkedResponseSpan!.status).toBe('ok');
            expect(unlinkedResponseSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(unlinkedResponseSpan!.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toBeUndefined();

            const previousResponseSpan = container.items.find(
              span => span.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE]?.value === 'resp_mock_conv_123',
            );
            expect(previousResponseSpan).toBeDefined();
            expect(previousResponseSpan!.status).toBe('ok');
            expect(previousResponseSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(previousResponseSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(previousResponseSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: 'auto.ai.openai',
            });
            expect(previousResponseSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'openai',
            });
            expect(previousResponseSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'gpt-4',
            });
            expect(previousResponseSpan!.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'resp_mock_conv_123',
            });
          },
        })
        .start()
        .completed();
    });
  });

  // Test for manual conversation ID setting using setConversationId()
  createEsmAndCjsTests(__dirname, 'scenario-manual-conversation-id.mjs', 'instrument.mjs', (createRunner, test) => {
    test('attaches manual conversation ID set via setConversationId() to all chat spans', async () => {
      await createRunner()
        .ignore('event')
        .expect({
          transaction: {
            transaction: 'chat-with-manual-conversation-id',
          },
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);

            // All three chat completion spans should have the same manually-set conversation ID
            for (const span of container.items) {
              expect(span!.name).toBe('chat gpt-4');
              expect(span!.status).toBe('ok');
              expect(span!.attributes['gen_ai.conversation.id']).toEqual({
                type: 'string',
                value: 'user_chat_session_abc123',
              });
              expect(span!.attributes['gen_ai.system']).toEqual({ type: 'string', value: 'openai' });
              expect(span!.attributes['gen_ai.request.model']).toEqual({ type: 'string', value: 'gpt-4' });
              expect(span!.attributes['gen_ai.operation.name']).toEqual({ type: 'string', value: 'chat' });
              expect(span!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.chat' });
            }
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-separate-scope-1.mjs', 'instrument.mjs', (createRunner, test) => {
    test('isolates conversation IDs across separate scopes - conversation 1', async () => {
      await createRunner()
        .ignore('event')
        .expect({
          transaction: {
            transaction: 'GET /chat/conversation-1',
          },
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(2);

            // Both chat completion spans should have the expected conversation ID
            for (const span of container.items) {
              expect(span!.name).toBe('chat gpt-4');
              expect(span!.status).toBe('ok');
              expect(span!.attributes['gen_ai.conversation.id']).toEqual({
                type: 'string',
                value: 'conv_user1_session_abc',
              });
              expect(span!.attributes['gen_ai.system']).toEqual({ type: 'string', value: 'openai' });
              expect(span!.attributes['gen_ai.request.model']).toEqual({ type: 'string', value: 'gpt-4' });
              expect(span!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.chat' });
            }
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-separate-scope-2.mjs', 'instrument.mjs', (createRunner, test) => {
    test('isolates conversation IDs across separate scopes - conversation 2', async () => {
      await createRunner()
        .ignore('event')
        .expect({
          transaction: {
            transaction: 'GET /chat/conversation-2',
          },
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(2);

            // Both chat completion spans should have the expected conversation ID
            for (const span of container.items) {
              expect(span!.name).toBe('chat gpt-4');
              expect(span!.status).toBe('ok');
              expect(span!.attributes['gen_ai.conversation.id']).toEqual({
                type: 'string',
                value: 'conv_user2_session_xyz',
              });
              expect(span!.attributes['gen_ai.system']).toEqual({ type: 'string', value: 'openai' });
              expect(span!.attributes['gen_ai.request.model']).toEqual({ type: 'string', value: 'gpt-4' });
              expect(span!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.chat' });
            }
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-system-instructions.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('extracts system instructions from messages', async () => {
        await createRunner()
          .ignore('event')
          .expect({
            transaction: {
              transaction: 'main',
            },
          })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(1);
              const [firstSpan] = container.items;

              // [0] chat completion with system instructions extracted from messages
              expect(firstSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toEqual({
                type: 'string',
                value: JSON.stringify([{ type: 'text', content: 'You are a helpful assistant' }]),
              });
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(__dirname, 'scenario-with-response.mjs', 'instrument.mjs', (createRunner, test) => {
    test('preserves .withResponse() method and works correctly', async () => {
      await createRunner()
        .ignore('event')
        .expect({
          transaction: {
            transaction: 'main',
          },
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(2);

            // Both calls should produce spans with the same response ID
            for (const span of container.items) {
              expect(span!.name).toBe('chat gpt-4');
              expect(span!.status).toBe('ok');
              expect(span!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
              expect(span!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
              expect(span!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'chatcmpl-withresponse',
              });
            }
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-vision.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('redacts inline base64 image data in vision requests', async () => {
      await createRunner()
        .ignore('event')
        .expect({
          transaction: {
            transaction: 'main',
          },
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(2);

            // Both vision request spans should contain [Blob substitute]
            for (const span of container.items) {
              expect(span!.name).toBe('chat gpt-4o');
              expect(span!.status).toBe('ok');
              expect(span!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
              expect(span!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4o' });
              expect(span!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 1,
              });
              expect(span!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toContain('[Blob substitute]');
            }
          },
        })
        .start()
        .completed();
    });

    test('preserves regular URLs in image_url (does not redact https links)', async () => {
      await createRunner()
        .ignore('event')
        .expect({
          transaction: {
            transaction: 'main',
          },
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(2);
            const multipleImagesSpan = container.items.find(span =>
              span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.includes('https://example.com/image.png'),
            );
            expect(multipleImagesSpan).toBeDefined();
            expect(multipleImagesSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toContain(
              'https://example.com/image.png',
            );
          },
        })
        .start()
        .completed();
    });
  });

  const streamingLongContent = 'A'.repeat(50_000);
  const streamingLongString = 'B'.repeat(50_000);

  createEsmAndCjsTests(__dirname, 'scenario-span-streaming.mjs', 'instrument-streaming.mjs', (createRunner, test) => {
    test('automatically disables truncation when span streaming is enabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            const spans = container.items;

            const chatSpan = spans.find(s =>
              s.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.includes(streamingLongContent),
            );
            expect(chatSpan).toBeDefined();

            const responsesSpan = spans.find(s =>
              s.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.includes(streamingLongString),
            );
            expect(responsesSpan).toBeDefined();
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-span-streaming.mjs',
    'instrument-streaming-with-truncation.mjs',
    (createRunner, test) => {
      test('respects explicit enableTruncation: true even when span streaming is enabled', async () => {
        await createRunner()
          .expect({
            span: container => {
              const spans = container.items;

              // With explicit enableTruncation: true, content should be truncated despite streaming.
              // Truncation keeps only the last message (50k 'A's) and crops it to the byte limit.
              const chatSpan = spans.find(s =>
                s.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.startsWith('[{"role":"user","content":"AAAA'),
              );
              expect(chatSpan).toBeDefined();
              expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value.length).toBeLessThan(
                streamingLongContent.length,
              );

              // The responses API string input (50k 'B's) should also be truncated.
              const responsesSpan = spans.find(s =>
                s.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.startsWith('BBB'),
              );
              expect(responsesSpan).toBeDefined();
              expect(responsesSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value.length).toBeLessThan(
                streamingLongString.length,
              );
            },
          })
          .start()
          .completed();
      });
    },
  );
});
