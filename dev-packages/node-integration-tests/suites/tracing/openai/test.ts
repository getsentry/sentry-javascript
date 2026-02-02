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
  OPENAI_RESPONSE_ID_ATTRIBUTE,
  OPENAI_RESPONSE_MODEL_ATTRIBUTE,
  OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE,
  OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('OpenAI integration', () => {
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
          [GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]: JSON.stringify([
            { type: 'text', content: 'You are a helpful assistant.' },
          ]),
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
          [GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]: JSON.stringify([
            { type: 'text', content: 'You are a helpful assistant.' },
          ]),
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
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String), // Should include messages when recordInputs: true
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: expect.any(String), // Should include response text when recordOutputs: true
        }),
      }),
      // Check that custom options are respected for streaming
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String), // Should include messages when recordInputs: true
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: expect.any(String), // Should include response text when recordOutputs: true
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true, // Should be marked as stream
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-chat.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates openai related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE_CHAT })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-chat.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates openai related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE_CHAT })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-chat.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('creates openai related spans with custom options', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_WITH_OPTIONS })
        .start()
        .completed();
    });
  });

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
  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates openai related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE_EMBEDDINGS })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates openai related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE_EMBEDDINGS })
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
              spans: expect.arrayContaining([
                // First call: Last message is large and gets truncated (only C's remain, D's are cropped)
                expect.objectContaining({
                  data: expect.objectContaining({
                    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
                    [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
                    [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
                    // Messages should be present (truncation happened) and should be a JSON array of a single index
                    [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.stringMatching(/^\[\{"role":"user","content":"C+"\}\]$/),
                    [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 2,
                    [GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]: expect.stringMatching(
                      /^\[\{"type":"text","content":"A+"\}\]$/,
                    ),
                  }),
                  description: 'chat gpt-3.5-turbo',
                  op: 'gen_ai.chat',
                  origin: 'auto.ai.openai',
                  status: 'ok',
                }),
                // Second call: Last message is small and kept without truncation
                expect.objectContaining({
                  data: expect.objectContaining({
                    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
                    [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
                    [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
                    // Small message should be kept intact
                    [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: JSON.stringify([
                      { role: 'user', content: 'This is a small message that fits within the limit' },
                    ]),
                    [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 2,
                    [GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]: expect.stringMatching(
                      /^\[\{"type":"text","content":"A+"\}\]$/,
                    ),
                  }),
                  description: 'chat gpt-3.5-turbo',
                  op: 'gen_ai.chat',
                  origin: 'auto.ai.openai',
                  status: 'ok',
                }),
              ]),
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
              spans: expect.arrayContaining([
                expect.objectContaining({
                  data: expect.objectContaining({
                    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
                    [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
                    [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
                    // Messages should be present and should include truncated string input (contains only As)
                    [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.stringMatching(/^A+$/),
                    [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
                  }),
                  description: 'chat gpt-3.5-turbo',
                  op: 'gen_ai.chat',
                  origin: 'auto.ai.openai',
                  status: 'ok',
                }),
              ]),
            },
          })
          .start()
          .completed();
      });
    },
  );

  // Test for conversation ID support (Conversations API and previous_response_id)
  const EXPECTED_TRANSACTION_CONVERSATION = {
    transaction: 'conversation-test',
    spans: expect.arrayContaining([
      // First span - conversations.create returns conversation object with id
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          // The conversation ID should be captured from the response
          [GEN_AI_CONVERSATION_ID_ATTRIBUTE]: 'conv_689667905b048191b4740501625afd940c7533ace33a2dab',
        }),
        description: 'chat unknown',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Second span - responses.create with conversation parameter
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-4',
          // The conversation ID should be captured from the request
          [GEN_AI_CONVERSATION_ID_ATTRIBUTE]: 'conv_689667905b048191b4740501625afd940c7533ace33a2dab',
        }),
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Third span - responses.create without conversation (first in chain, should NOT have gen_ai.conversation.id)
      expect.objectContaining({
        data: expect.not.objectContaining({
          [GEN_AI_CONVERSATION_ID_ATTRIBUTE]: expect.anything(),
        }),
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Fourth span - responses.create with previous_response_id (chaining)
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-4',
          // The previous_response_id should be captured as conversation.id
          [GEN_AI_CONVERSATION_ID_ATTRIBUTE]: 'resp_mock_conv_123',
        }),
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-conversation.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures conversation ID from Conversations API and previous_response_id', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_CONVERSATION })
        .start()
        .completed();
    });
  });

  // Test for manual conversation ID setting using setConversationId()
  const EXPECTED_TRANSACTION_MANUAL_CONVERSATION_ID = {
    transaction: 'chat-with-manual-conversation-id',
    spans: expect.arrayContaining([
      // All three chat completion spans should have the same manually-set conversation ID
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.conversation.id': 'user_chat_session_abc123',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
        }),
        description: 'chat gpt-4',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.conversation.id': 'user_chat_session_abc123',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
        }),
        description: 'chat gpt-4',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.conversation.id': 'user_chat_session_abc123',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
        }),
        description: 'chat gpt-4',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-manual-conversation-id.mjs', 'instrument.mjs', (createRunner, test) => {
    test('attaches manual conversation ID set via setConversationId() to all chat spans', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_MANUAL_CONVERSATION_ID })
        .start()
        .completed();
    });
  });

  // Test for scope isolation - different scopes have different conversation IDs
  const EXPECTED_TRANSACTION_CONVERSATION_1 = {
    transaction: 'GET /chat/conversation-1',
    spans: expect.arrayContaining([
      // Both chat completion spans in conversation 1 should have conv_user1_session_abc
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.conversation.id': 'conv_user1_session_abc',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'sentry.op': 'gen_ai.chat',
        }),
        description: 'chat gpt-4',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.conversation.id': 'conv_user1_session_abc',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'sentry.op': 'gen_ai.chat',
        }),
        description: 'chat gpt-4',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_CONVERSATION_2 = {
    transaction: 'GET /chat/conversation-2',
    spans: expect.arrayContaining([
      // Both chat completion spans in conversation 2 should have conv_user2_session_xyz
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.conversation.id': 'conv_user2_session_xyz',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'sentry.op': 'gen_ai.chat',
        }),
        description: 'chat gpt-4',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.conversation.id': 'conv_user2_session_xyz',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'sentry.op': 'gen_ai.chat',
        }),
        description: 'chat gpt-4',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-separate-scope-1.mjs', 'instrument.mjs', (createRunner, test) => {
    test('isolates conversation IDs across separate scopes - conversation 1', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_CONVERSATION_1 })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-separate-scope-2.mjs', 'instrument.mjs', (createRunner, test) => {
    test('isolates conversation IDs across separate scopes - conversation 2', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_CONVERSATION_2 })
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
              spans: expect.arrayContaining([
                expect.objectContaining({
                  data: expect.objectContaining({
                    [GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]: JSON.stringify([
                      { type: 'text', content: 'You are a helpful assistant' },
                    ]),
                  }),
                }),
              ]),
            },
          })
          .start()
          .completed();
      });
    },
  );
});
