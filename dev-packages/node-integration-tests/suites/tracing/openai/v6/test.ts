import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import {
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
} from '../../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('OpenAI integration (V6)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-chat.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates openai related spans with sendDefaultPii: false (v6)', async () => {
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
    },
    {
      additionalDependencies: {
        openai: '6.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-chat.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('creates openai related spans with sendDefaultPii: true (v6)', async () => {
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
                value: '[{"type":"text","content":"You are a helpful assistant."}]',
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
                value: '[{"type":"text","content":"You are a helpful assistant."}]',
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
    },
    {
      additionalDependencies: {
        openai: '6.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-chat.mjs',
    'instrument-with-options.mjs',
    (createRunner, test) => {
      test('creates openai related spans with custom options (v6)', async () => {
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
              expect(chatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toMatchObject({
                type: 'integer',
                value: 1,
              });
              expect(chatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toMatchObject({
                type: 'string',
                value: expect.any(String),
              });
              expect(chatCompletionSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toMatchObject({
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
              expect(
                streamingChatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE],
              ).toMatchObject({
                type: 'integer',
                value: 1,
              });
              expect(streamingChatCompletionSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toMatchObject({
                type: 'string',
                value: expect.any(String),
              });
              expect(streamingChatCompletionSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toMatchObject({
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
    },
    {
      additionalDependencies: {
        openai: '6.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-embeddings.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates openai related spans with sendDefaultPii: false (v6)', async () => {
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
    },
    {
      additionalDependencies: {
        openai: '6.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-embeddings.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('creates openai related spans with sendDefaultPii: true (v6)', async () => {
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
    },
    {
      additionalDependencies: {
        openai: '6.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-root-span.mjs',
    'instrument-root-span.mjs',
    (createRunner, test) => {
      test('it works without a wrapping span (v6)', async () => {
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
    },
    {
      additionalDependencies: {
        openai: '6.0.0',
        express: 'latest',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-azure-openai.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('it works with Azure OpenAI (v6)', async () => {
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
    },
    {
      additionalDependencies: {
        openai: '6.0.0',
        express: 'latest',
      },
    },
  );
});
