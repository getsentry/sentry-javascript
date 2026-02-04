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
  OPENAI_RESPONSE_ID_ATTRIBUTE,
  OPENAI_RESPONSE_MODEL_ATTRIBUTE,
  OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE,
  OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
} from '../../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('OpenAI integration (V6)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION_DEFAULT_PII_FALSE_CHAT = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - basic chat completion without PII
      expect.objectContaining({
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
          [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-mock123',
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
          [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:31:28.000Z',
          [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 15,
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 10,
        },
        description: 'chat gpt-3.5-turbo',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Second span - responses API
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'resp_mock456',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["completed"]',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 5,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 8,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 13,
          [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'resp_mock456',
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
          [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:31:30.000Z',
          [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 8,
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 5,
        },
        description: 'chat gpt-3.5-turbo',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Third span - error handling
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'error-model',
        },
        description: 'chat error-model',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'internal_error',
      }),
      // Fourth span - chat completions streaming
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.8,
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-stream-123',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["stop"]',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 12,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 18,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 30,
          [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-stream-123',
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:31:40.000Z',
          [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 18,
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 12,
        },
        description: 'chat gpt-4 stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Fifth span - responses API streaming
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'resp_stream_456',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["in_progress","completed"]',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 6,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 16,
          [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'resp_stream_456',
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:31:50.000Z',
          [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 10,
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 6,
        },
        description: 'chat gpt-4 stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Sixth span - error handling in streaming context
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'error-model',
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
        },
        description: 'chat error-model stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'internal_error',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE_CHAT = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - basic chat completion with PII
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.7,
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","content":"What is the capital of France?"}]',
          [GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]: '[{"type":"text","content":"You are a helpful assistant."}]',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-mock123',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["stop"]',
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: '["Hello from OpenAI mock!"]',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 25,
          [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-mock123',
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
          [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:31:28.000Z',
          [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 15,
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 10,
        },
        description: 'chat gpt-3.5-turbo',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Second span - responses API with PII
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: 'Translate this to French: Hello',
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: 'Response to: Translate this to French: Hello',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["completed"]',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'resp_mock456',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 5,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 8,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 13,
          [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'resp_mock456',
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
          [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:31:30.000Z',
          [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 8,
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 5,
        },
        description: 'chat gpt-3.5-turbo',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Third span - error handling with PII
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'error-model',
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","content":"This will fail"}]',
        },
        description: 'chat error-model',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'internal_error',
      }),
      // Fourth span - chat completions streaming with PII
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.8,
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","content":"Tell me about streaming"}]',
          [GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]: '[{"type":"text","content":"You are a helpful assistant."}]',
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: 'Hello from OpenAI streaming!',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["stop"]',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-stream-123',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 12,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 18,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 30,
          [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-stream-123',
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:31:40.000Z',
          [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 18,
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 12,
        }),
        description: 'chat gpt-4 stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Fifth span - responses API streaming with PII
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: 'Test streaming responses API',
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]:
            'Streaming response to: Test streaming responses APITest streaming responses API',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["in_progress","completed"]',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'resp_stream_456',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 6,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 16,
          [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'resp_stream_456',
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4',
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:31:50.000Z',
          [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 10,
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 6,
        }),
        description: 'chat gpt-4 stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Sixth span - error handling in streaming context with PII
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'error-model',
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","content":"This will fail"}]',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
        },
        description: 'chat error-model stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'internal_error',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_WITH_OPTIONS = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // Check that custom options are respected
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String), // Should include messages when recordInputs: true
          [GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]: expect.any(String), // System instructions should be extracted
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: expect.any(String), // Should include response text when recordOutputs: true
        }),
      }),
      // Check that custom options are respected for streaming
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String), // Should include messages when recordInputs: true
          [GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]: expect.any(String), // System instructions should be extracted
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: expect.any(String), // Should include response text when recordOutputs: true
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true, // Should be marked as stream
        }),
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_DEFAULT_PII_FALSE_EMBEDDINGS = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - embeddings API
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'embeddings',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.embeddings',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'text-embedding-3-small',
          [GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE]: 'float',
          [GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE]: 1536,
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'text-embedding-3-small',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 10,
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'text-embedding-3-small',
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 10,
        },
        description: 'embeddings text-embedding-3-small',
        op: 'gen_ai.embeddings',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Second span - embeddings API error model
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'embeddings',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.embeddings',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'error-model',
        },
        description: 'embeddings error-model',
        op: 'gen_ai.embeddings',
        origin: 'auto.ai.openai',
        status: 'internal_error',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE_EMBEDDINGS = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - embeddings API with PII
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'embeddings',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.embeddings',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'text-embedding-3-small',
          [GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE]: 'float',
          [GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE]: 1536,
          [GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]: 'Embedding test!',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'text-embedding-3-small',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 10,
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'text-embedding-3-small',
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 10,
        },
        description: 'embeddings text-embedding-3-small',
        op: 'gen_ai.embeddings',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Second span - embeddings API error model with PII
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'embeddings',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.embeddings',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'error-model',
          [GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]: 'Error embedding test!',
        },
        description: 'embeddings error-model',
        op: 'gen_ai.embeddings',
        origin: 'auto.ai.openai',
        status: 'internal_error',
      }),
      // Third span - embeddings API with multiple inputs (this does not get truncated)
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'embeddings',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.embeddings',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'text-embedding-3-small',
          [GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]: '["First input text","Second input text","Third input text"]',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'text-embedding-3-small',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 10,
          [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'text-embedding-3-small',
          [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 10,
        },
        description: 'embeddings text-embedding-3-small',
        op: 'gen_ai.embeddings',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(
    __dirname,
    'scenario-chat.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates openai related spans with sendDefaultPii: false (v6)', async () => {
        await createRunner()
          .ignore('event')
          .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE_CHAT })
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
          .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE_CHAT })
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
          .expect({ transaction: EXPECTED_TRANSACTION_WITH_OPTIONS })
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
          .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE_EMBEDDINGS })
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
          .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE_EMBEDDINGS })
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
                    [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-mock123',
                    [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
                    [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:31:28.000Z',
                    [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 15,
                    [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 10,
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
                    [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-mock123',
                    [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
                    [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2023-03-01T06:31:28.000Z',
                    [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 15,
                    [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 10,
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
