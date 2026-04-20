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
            expect(firstSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]).toEqual({ type: 'double', value: 0.7 });
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
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 10 });
            expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 15 });
            expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 25 });

            // [1] responses API
            expect(secondSpan!.name).toBe('chat gpt-3.5-turbo');
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
            expect(secondSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 5 });
            expect(secondSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 8 });
            expect(secondSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 13 });

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
            expect(fourthSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]).toEqual({
              type: 'double',
              value: 0.8,
            });
            expect(fourthSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({ type: 'boolean', value: true });
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chatcmpl-stream-123',
            });
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["stop"]',
            });
            expect(fourthSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 12 });
            expect(fourthSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 18,
            });
            expect(fourthSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 30 });
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
            expect(fifthSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(fifthSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'resp_stream_456',
            });
            expect(fifthSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '["in_progress","completed"]',
            });
            expect(fifthSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 6 });
            expect(fifthSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 10 });
            expect(fifthSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 16 });
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
  });

  createEsmAndCjsTests(__dirname, 'scenario-chat.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates openai related spans with sendDefaultPii: true', async () => {
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
            expect(firstSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]).toEqual({ type: 'double', value: 0.7 });
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
              value: JSON.stringify([{ type: 'text', content: 'You are a helpful assistant.' }]),
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
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 10 });
            expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 15 });
            expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 25 });

            // [1] responses API with PII
            expect(secondSpan!.name).toBe('chat gpt-3.5-turbo');
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
            expect(secondSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 5 });
            expect(secondSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 8 });
            expect(secondSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 13 });

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
              value: JSON.stringify([{ type: 'text', content: 'You are a helpful assistant.' }]),
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
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(fourthSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 12 });
            expect(fourthSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 18,
            });
            expect(fourthSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 30 });
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
            expect(fifthSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-4' });
            expect(fifthSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 6 });
            expect(fifthSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 10 });
            expect(fifthSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 16 });
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
  });

  createEsmAndCjsTests(__dirname, 'scenario-chat.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('creates openai related spans with custom options', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(6);
            const [firstSpan, , , fourthSpan] = container.items;

            // [0] non-streaming with input messages recorded via custom options
            expect(firstSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
            expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toMatchObject({
              type: 'string',
              value: expect.any(String),
            });
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toMatchObject({
              type: 'string',
              value: expect.any(String),
            });

            // [3] streaming with input messages recorded via custom options
            expect(fourthSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toEqual({ type: 'boolean', value: true });
            expect(fourthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toMatchObject({
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
              const [firstSpan, secondSpan] = container.items;

              // [0] chat completions: multiple messages all preserved (no popping to last message only)
              expect(firstSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'chatcmpl-mock123',
              });
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toMatchObject({
                type: 'string',
                value: JSON.stringify([
                  { role: 'user', content: longContent },
                  { role: 'assistant', content: 'Some reply' },
                  { role: 'user', content: 'Follow-up question' },
                ]),
              });
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toMatchObject({
                type: 'integer',
                value: 3,
              });

              // [1] responses API long string input is not truncated or wrapped in quotes
              expect(secondSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'resp_mock456',
              });
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toMatchObject({
                type: 'string',
                value: 'B'.repeat(50_000),
              });
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toMatchObject({
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
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 10 });
            expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 10 });

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
            expect(thirdSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 10 });
            expect(thirdSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 10 });
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
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 10 });
            expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 10 });

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
            expect(thirdSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 10 });
            expect(thirdSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 10 });
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
              const [firstSpan, secondSpan] = container.items;

              // [0] Last message is large and gets truncated (only C's remain, D's are cropped)
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
                value: 2,
              });
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toMatch(
                /^\[\{"role":"user","content":"C+"\}\]$/,
              );
              expect(firstSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE].value).toMatch(
                /^\[\{"type":"text","content":"A+"\}\]$/,
              );

              // [1] Last message is small and kept without truncation
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
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
                type: 'string',
                value: JSON.stringify([
                  { role: 'user', content: 'This is a small message that fits within the limit' },
                ]),
              });
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 2,
              });
              expect(secondSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE].value).toMatch(
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
            const [firstSpan, secondSpan, thirdSpan, fourthSpan] = container.items;

            // [0] conversations.create returns conversation object with id
            expect(firstSpan!.name).toBe('chat unknown');
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
            expect(firstSpan!.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'conv_689667905b048191b4740501625afd940c7533ace33a2dab',
            });

            // [1] responses.create with conversation parameter
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
            expect(secondSpan!.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'conv_689667905b048191b4740501625afd940c7533ace33a2dab',
            });

            // [2] responses.create without conversation (first in chain, should NOT have gen_ai.conversation.id)
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(thirdSpan!.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toBeUndefined();

            // [3] responses.create with previous_response_id (chaining)
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
            expect(fourthSpan!.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toEqual({
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
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // All three chat completion spans should have the same manually-set conversation ID
            for (const span of [firstSpan, secondSpan, thirdSpan]) {
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
            const [firstSpan, secondSpan] = container.items;

            // Both chat completion spans should have the expected conversation ID
            for (const span of [firstSpan, secondSpan]) {
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
            const [firstSpan, secondSpan] = container.items;

            // Both chat completion spans should have the expected conversation ID
            for (const span of [firstSpan, secondSpan]) {
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
            const [firstSpan, secondSpan] = container.items;

            // Both calls should produce spans with the same response ID
            for (const span of [firstSpan, secondSpan]) {
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
            const [firstSpan, secondSpan] = container.items;

            // Both vision request spans should contain [Blob substitute]
            for (const span of [firstSpan, secondSpan]) {
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
            const [, secondSpan] = container.items;

            // [1] multiple images span contains the https URL
            expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toContain(
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
            expect(container.items).toHaveLength(15);
            const [, , , , , , seventhSpan, , , , , , , fourteenthSpan] = container.items;

            // [6] chat completions: full long content preserved (streaming disables truncation)
            expect(seventhSpan!.name).toBe('chat gpt-4');
            expect(seventhSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chatcmpl-mock123',
            });
            expect(seventhSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toContain(streamingLongContent);

            // [13] responses API: full long string preserved (streaming disables truncation)
            expect(fourteenthSpan!.name).toBe('chat gpt-4');
            expect(fourteenthSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'resp_mock456',
            });
            expect(fourteenthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toContain(streamingLongString);
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
              expect(container.items).toHaveLength(15);
              const [, , , , , , seventhSpan, , , , , , , fourteenthSpan] = container.items;

              // [6] chat completions: content truncated despite streaming when enableTruncation is explicitly true.
              // Truncation keeps only the last message (50k 'A's) and crops it to the byte limit.
              expect(seventhSpan!.name).toBe('chat gpt-4');
              expect(seventhSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'chatcmpl-mock123',
              });
              expect(seventhSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toMatch(
                /^\[\{"role":"user","content":"AAAA/,
              );
              expect(seventhSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value.length).toBeLessThan(
                streamingLongContent.length,
              );

              // [13] responses API: long string input (50k 'B's) is also truncated.
              expect(fourteenthSpan!.name).toBe('chat gpt-4');
              expect(fourteenthSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'resp_mock456',
              });
              expect(fourteenthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toMatch(/^BBB/);
              expect(fourteenthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value.length).toBeLessThan(
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
