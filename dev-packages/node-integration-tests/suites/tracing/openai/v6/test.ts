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
              const [firstSpan, secondSpan, thirdSpan, fourthSpan, fifthSpan, sixthSpan] = container.items;

              // [0] basic chat completion without PII
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
              expect(firstSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]).toEqual({
                type: 'double',
                value: 0.7,
              });
              expect(firstSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'gpt-3.5-turbo',
              });
              expect(firstSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'chatcmpl-mock123',
              });
              expect(firstSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '["stop"]',
              });
              expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 10,
              });
              expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 15,
              });
              expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 25,
              });

              // [1] responses API
              expect(secondSpan!.name).toBe('chat gpt-3.5-turbo');
              expect(secondSpan!.status).toBe('ok');
              expect(secondSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'chat',
              });
              expect(secondSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.chat',
              });
              expect(secondSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: 'auto.ai.openai',
              });
              expect(secondSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
              expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'gpt-3.5-turbo',
              });
              expect(secondSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'gpt-3.5-turbo',
              });
              expect(secondSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'resp_mock456',
              });
              expect(secondSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '["completed"]',
              });
              expect(secondSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 5,
              });
              expect(secondSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 8,
              });
              expect(secondSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 13,
              });

              // [2] error handling (non-streaming)
              expect(thirdSpan!.name).toBe('chat error-model');
              expect(thirdSpan!.status).toBe('error');
              expect(thirdSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
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
              expect(thirdSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'error-model',
              });

              // [3] chat completions streaming
              expect(fourthSpan!.name).toBe('chat gpt-4');
              expect(fourthSpan!.status).toBe('ok');
              expect(fourthSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'chat',
              });
              expect(fourthSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.chat',
              });
              expect(fourthSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: 'auto.ai.openai',
              });
              expect(fourthSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
              expect(fourthSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'gpt-4',
              });
              expect(fourthSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]).toEqual({
                type: 'double',
                value: 0.8,
              });
              expect(fourthSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({ type: 'boolean', value: true });
              expect(fourthSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'gpt-4',
              });
              expect(fourthSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'chatcmpl-stream-123',
              });
              expect(fourthSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '["stop"]',
              });
              expect(fourthSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 12,
              });
              expect(fourthSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 18,
              });
              expect(fourthSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 30,
              });
              expect(fourthSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
                type: 'boolean',
                value: true,
              });

              // [4] responses API streaming
              expect(fifthSpan!.name).toBe('chat gpt-4');
              expect(fifthSpan!.status).toBe('ok');
              expect(fifthSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
              expect(fifthSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.chat',
              });
              expect(fifthSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: 'auto.ai.openai',
              });
              expect(fifthSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
              expect(fifthSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
              expect(fifthSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({ type: 'boolean', value: true });
              expect(fifthSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'gpt-4',
              });
              expect(fifthSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'resp_stream_456',
              });
              expect(fifthSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '["in_progress","completed"]',
              });
              expect(fifthSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 6,
              });
              expect(fifthSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 10,
              });
              expect(fifthSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 16,
              });
              expect(fifthSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
                type: 'boolean',
                value: true,
              });

              // [5] error handling in streaming context
              expect(sixthSpan!.name).toBe('chat error-model');
              expect(sixthSpan!.status).toBe('error');
              expect(sixthSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
              expect(sixthSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'error-model',
              });
              expect(sixthSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({ type: 'boolean', value: true });
              expect(sixthSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
              expect(sixthSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.chat',
              });
              expect(sixthSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
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
              const [firstSpan, secondSpan, thirdSpan, fourthSpan, fifthSpan, sixthSpan] = container.items;

              // [0] basic chat completion with PII
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
              expect(firstSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]).toEqual({
                type: 'double',
                value: 0.7,
              });
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 1,
              });
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '[{"role":"user","content":"What is the capital of France?"}]',
              });
              expect(firstSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '[{"type":"text","content":"You are a helpful assistant."}]',
              });
              expect(firstSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'gpt-3.5-turbo',
              });
              expect(firstSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'chatcmpl-mock123',
              });
              expect(firstSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '["stop"]',
              });
              expect(firstSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '["Hello from OpenAI mock!"]',
              });
              expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 10,
              });
              expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 15,
              });
              expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 25,
              });

              // [1] responses API with PII
              expect(secondSpan!.name).toBe('chat gpt-3.5-turbo');
              expect(secondSpan!.status).toBe('ok');
              expect(secondSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'chat',
              });
              expect(secondSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.chat',
              });
              expect(secondSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: 'auto.ai.openai',
              });
              expect(secondSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
              expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'gpt-3.5-turbo',
              });
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 1,
              });
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'Translate this to French: Hello',
              });
              expect(secondSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'Response to: Translate this to French: Hello',
              });
              expect(secondSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '["completed"]',
              });
              expect(secondSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'gpt-3.5-turbo',
              });
              expect(secondSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'resp_mock456',
              });
              expect(secondSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 5,
              });
              expect(secondSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 8,
              });
              expect(secondSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 13,
              });

              // [2] error handling with PII (non-streaming)
              expect(thirdSpan!.name).toBe('chat error-model');
              expect(thirdSpan!.status).toBe('error');
              expect(thirdSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
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
              expect(thirdSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'error-model',
              });
              expect(thirdSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 1,
              });
              expect(thirdSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '[{"role":"user","content":"This will fail"}]',
              });

              // [3] chat completions streaming with PII
              expect(fourthSpan!.name).toBe('chat gpt-4');
              expect(fourthSpan!.status).toBe('ok');
              expect(fourthSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'chat',
              });
              expect(fourthSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.chat',
              });
              expect(fourthSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: 'auto.ai.openai',
              });
              expect(fourthSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
              expect(fourthSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'gpt-4',
              });
              expect(fourthSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]).toEqual({
                type: 'double',
                value: 0.8,
              });
              expect(fourthSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({ type: 'boolean', value: true });
              expect(fourthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 1,
              });
              expect(fourthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '[{"role":"user","content":"Tell me about streaming"}]',
              });
              expect(fourthSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '[{"type":"text","content":"You are a helpful assistant."}]',
              });
              expect(fourthSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'Hello from OpenAI streaming!',
              });
              expect(fourthSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '["stop"]',
              });
              expect(fourthSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'chatcmpl-stream-123',
              });
              expect(fourthSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'gpt-4',
              });
              expect(fourthSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 12,
              });
              expect(fourthSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 18,
              });
              expect(fourthSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 30,
              });
              expect(fourthSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
                type: 'boolean',
                value: true,
              });

              // [4] responses API streaming with PII
              expect(fifthSpan!.name).toBe('chat gpt-4');
              expect(fifthSpan!.status).toBe('ok');
              expect(fifthSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
              expect(fifthSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.chat',
              });
              expect(fifthSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: 'auto.ai.openai',
              });
              expect(fifthSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
              expect(fifthSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
              expect(fifthSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({ type: 'boolean', value: true });
              expect(fifthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 1,
              });
              expect(fifthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'Test streaming responses API',
              });
              expect(fifthSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'Streaming response to: Test streaming responses APITest streaming responses API',
              });
              expect(fifthSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '["in_progress","completed"]',
              });
              expect(fifthSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'resp_stream_456',
              });
              expect(fifthSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'gpt-4',
              });
              expect(fifthSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 6,
              });
              expect(fifthSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 10,
              });
              expect(fifthSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 16,
              });
              expect(fifthSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
                type: 'boolean',
                value: true,
              });

              // [5] error handling in streaming context with PII
              expect(sixthSpan!.name).toBe('chat error-model');
              expect(sixthSpan!.status).toBe('error');
              expect(sixthSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
              expect(sixthSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'error-model',
              });
              expect(sixthSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({ type: 'boolean', value: true });
              expect(sixthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 1,
              });
              expect(sixthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '[{"role":"user","content":"This will fail"}]',
              });
              expect(sixthSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
              expect(sixthSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.chat',
              });
              expect(sixthSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
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
              const [firstSpan, , , fourthSpan] = container.items;

              // [0] non-streaming with input messages recorded via custom options
              expect(firstSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toMatchObject({
                type: 'integer',
                value: 1,
              });
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toMatchObject({
                type: 'string',
                value: expect.any(String),
              });
              expect(firstSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toMatchObject({
                type: 'string',
                value: expect.any(String),
              });
              expect(firstSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toMatchObject({
                type: 'string',
                value: expect.any(String),
              });

              // [3] streaming with input messages recorded via custom options
              expect(fourthSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({ type: 'boolean', value: true });
              expect(fourthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toMatchObject({
                type: 'integer',
                value: 1,
              });
              expect(fourthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toMatchObject({
                type: 'string',
                value: expect.any(String),
              });
              expect(fourthSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toMatchObject({
                type: 'string',
                value: expect.any(String),
              });
              expect(fourthSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toMatchObject({
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
              const [firstSpan, secondSpan, thirdSpan] = container.items;

              // [0] embeddings API (single input)
              expect(firstSpan!.name).toBe('embeddings text-embedding-3-small');
              expect(firstSpan!.status).toBe('ok');
              expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'embeddings',
              });
              expect(firstSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.embeddings',
              });
              expect(firstSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: 'auto.ai.openai',
              });
              expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
              expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'text-embedding-3-small',
              });
              expect(firstSpan!.attributes[GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'float',
              });
              expect(firstSpan!.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 1536,
              });
              expect(firstSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'text-embedding-3-small',
              });
              expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 10,
              });
              expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 10,
              });

              // [1] embeddings API error model
              expect(secondSpan!.name).toBe('embeddings error-model');
              expect(secondSpan!.status).toBe('error');
              expect(secondSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'embeddings',
              });
              expect(secondSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.embeddings',
              });
              expect(secondSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: 'auto.ai.openai',
              });
              expect(secondSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
              expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'error-model',
              });

              // [2] embeddings API (multiple inputs)
              expect(thirdSpan!.name).toBe('embeddings text-embedding-3-small');
              expect(thirdSpan!.status).toBe('ok');
              expect(thirdSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'embeddings',
              });
              expect(thirdSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.embeddings',
              });
              expect(thirdSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: 'auto.ai.openai',
              });
              expect(thirdSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
              expect(thirdSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'text-embedding-3-small',
              });
              expect(thirdSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'text-embedding-3-small',
              });
              expect(thirdSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 10,
              });
              expect(thirdSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
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
              const [firstSpan, secondSpan, thirdSpan] = container.items;

              // [0] embeddings API with PII (single input)
              expect(firstSpan!.name).toBe('embeddings text-embedding-3-small');
              expect(firstSpan!.status).toBe('ok');
              expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'embeddings',
              });
              expect(firstSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.embeddings',
              });
              expect(firstSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: 'auto.ai.openai',
              });
              expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
              expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'text-embedding-3-small',
              });
              expect(firstSpan!.attributes[GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'float',
              });
              expect(firstSpan!.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 1536,
              });
              expect(firstSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'Embedding test!',
              });
              expect(firstSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'text-embedding-3-small',
              });
              expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 10,
              });
              expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 10,
              });

              // [1] embeddings API error model with PII
              expect(secondSpan!.name).toBe('embeddings error-model');
              expect(secondSpan!.status).toBe('error');
              expect(secondSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'embeddings',
              });
              expect(secondSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.embeddings',
              });
              expect(secondSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: 'auto.ai.openai',
              });
              expect(secondSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
              expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'error-model',
              });
              expect(secondSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'Error embedding test!',
              });

              // [2] embeddings API with multiple inputs (not truncated)
              expect(thirdSpan!.name).toBe('embeddings text-embedding-3-small');
              expect(thirdSpan!.status).toBe('ok');
              expect(thirdSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'embeddings',
              });
              expect(thirdSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.embeddings',
              });
              expect(thirdSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: 'auto.ai.openai',
              });
              expect(thirdSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
              expect(thirdSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'text-embedding-3-small',
              });
              expect(thirdSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]).toEqual({
                type: 'string',
                value: '["First input text","Second input text","Third input text"]',
              });
              expect(thirdSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'text-embedding-3-small',
              });
              expect(thirdSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 10,
              });
              expect(thirdSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
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
