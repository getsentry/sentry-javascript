import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_STREAMING_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('Google GenAI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION_DEFAULT_PII_FALSE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - chats.create
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-1.5-pro',
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.8,
          [GEN_AI_REQUEST_TOP_P_ATTRIBUTE]: 0.9,
          [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: 150,
        },
        description: 'chat gemini-1.5-pro create',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Second span - chat.sendMessage (should get model from context)
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-1.5-pro', // Should get from chat context
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 8,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 12,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 20,
        },
        description: 'chat gemini-1.5-pro',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Third span - models.generateContent
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-1.5-flash',
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.7,
          [GEN_AI_REQUEST_TOP_P_ATTRIBUTE]: 0.9,
          [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: 100,
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 8,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 12,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 20,
        },
        description: 'generate_content gemini-1.5-flash',
        op: 'gen_ai.generate_content',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Fourth span - error handling
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'error-model',
        },
        description: 'generate_content error-model',
        op: 'gen_ai.generate_content',
        origin: 'auto.ai.google_genai',
        status: 'internal_error',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - chats.create with PII
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-1.5-pro',
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.8,
          [GEN_AI_REQUEST_TOP_P_ATTRIBUTE]: 0.9,
          [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: 150,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","parts":[{"text":"Hello, how are you?"}]}]',
        }),
        description: 'chat gemini-1.5-pro create',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Second span - chat.sendMessage with PII
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-1.5-pro',
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String), // Should include message when recordInputs: true
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: expect.any(String), // Should include response when recordOutputs: true
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 8,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 12,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 20,
        }),
        description: 'chat gemini-1.5-pro',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Third span - models.generateContent with PII
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-1.5-flash',
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.7,
          [GEN_AI_REQUEST_TOP_P_ATTRIBUTE]: 0.9,
          [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: 100,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String), // Should include contents when recordInputs: true
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: expect.any(String), // Should include response when recordOutputs: true
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 8,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 12,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 20,
        }),
        description: 'generate_content gemini-1.5-flash',
        op: 'gen_ai.generate_content',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Fourth span - error handling with PII
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'error-model',
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String), // Should include contents when recordInputs: true
        }),
        description: 'generate_content error-model',
        op: 'gen_ai.generate_content',
        origin: 'auto.ai.google_genai',
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
        description: expect.not.stringContaining('stream-response'), // Non-streaming span
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates google genai related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates google genai related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('creates google genai related spans with custom options', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_WITH_OPTIONS })
        .start()
        .completed();
    });
  });

  const EXPECTED_AVAILABLE_TOOLS_JSON =
    '[{"name":"controlLight","parametersJsonSchema":{"type":"object","properties":{"brightness":{"type":"number"},"colorTemperature":{"type":"string"}},"required":["brightness","colorTemperature"]}}]';

  const EXPECTED_TRANSACTION_TOOLS = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // Non-streaming with tools
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-2.0-flash-001',
          [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: EXPECTED_AVAILABLE_TOOLS_JSON,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String), // Should include contents
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: expect.any(String), // Should include response text
          [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: expect.any(String), // Should include tool calls
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 8,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 23,
        }),
        description: 'generate_content gemini-2.0-flash-001',
        op: 'gen_ai.generate_content',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Streaming with tools
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-2.0-flash-001',
          [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: EXPECTED_AVAILABLE_TOOLS_JSON,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String), // Should include contents
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: expect.any(String), // Should include response text
          [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: expect.any(String), // Should include tool calls
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'mock-response-tools-id',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gemini-2.0-flash-001',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 12,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 22,
        }),
        description: 'generate_content gemini-2.0-flash-001 stream-response',
        op: 'gen_ai.generate_content',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Without tools for comparison
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-2.0-flash-001',
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String), // Should include contents
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: expect.any(String), // Should include response text
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 8,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 12,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 20,
        }),
        description: 'generate_content gemini-2.0-flash-001',
        op: 'gen_ai.generate_content',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-tools.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('creates google genai related spans with tool calls', async () => {
      await createRunner().ignore('event').expect({ transaction: EXPECTED_TRANSACTION_TOOLS }).start().completed();
    });
  });

  const EXPECTED_TRANSACTION_STREAMING = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - models.generateContentStream (streaming)
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-1.5-flash',
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.7,
          [GEN_AI_REQUEST_TOP_P_ATTRIBUTE]: 0.9,
          [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: 100,
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'mock-response-streaming-id',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gemini-1.5-pro',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["STOP"]',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 12,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 22,
        }),
        description: 'generate_content gemini-1.5-flash stream-response',
        op: 'gen_ai.generate_content',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Second span - chat.create
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-1.5-pro',
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.8,
          [GEN_AI_REQUEST_TOP_P_ATTRIBUTE]: 0.9,
          [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: 150,
        }),
        description: 'chat gemini-1.5-pro create',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Third span - chat.sendMessageStream (streaming)
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-1.5-pro',
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'mock-response-streaming-id',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gemini-1.5-pro',
        }),
        description: 'chat gemini-1.5-pro stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Fourth span - blocked content streaming
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
        }),
        description: 'generate_content blocked-model stream-response',
        op: 'gen_ai.generate_content',
        origin: 'auto.ai.google_genai',
        status: 'internal_error',
      }),
      // Fifth span - error handling for streaming
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
        }),
        description: 'generate_content error-model stream-response',
        op: 'gen_ai.generate_content',
        origin: 'auto.ai.google_genai',
        status: 'internal_error',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_STREAMING_PII_TRUE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - models.generateContentStream (streaming) with PII
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-1.5-flash',
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.7,
          [GEN_AI_REQUEST_TOP_P_ATTRIBUTE]: 0.9,
          [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: 100,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String), // Should include contents when recordInputs: true
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'mock-response-streaming-id',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gemini-1.5-pro',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["STOP"]',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 12,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 22,
        }),
        description: 'generate_content gemini-1.5-flash stream-response',
        op: 'gen_ai.generate_content',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Second span - chat.create
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-1.5-pro',
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.8,
          [GEN_AI_REQUEST_TOP_P_ATTRIBUTE]: 0.9,
          [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: 150,
        }),
        description: 'chat gemini-1.5-pro create',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Third span - chat.sendMessageStream (streaming) with PII
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-1.5-pro',
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String), // Should include message when recordInputs: true
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'mock-response-streaming-id',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gemini-1.5-pro',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["STOP"]',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 12,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 22,
        }),
        description: 'chat gemini-1.5-pro stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.google_genai',
        status: 'ok',
      }),
      // Fourth span - blocked content stream with PII
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'blocked-model',
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.7,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String), // Should include contents when recordInputs: true
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
        }),
        description: 'generate_content blocked-model stream-response',
        op: 'gen_ai.generate_content',
        origin: 'auto.ai.google_genai',
        status: 'internal_error',
      }),
      // Fifth span - error handling for streaming with PII
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'error-model',
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.7,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String), // Should include contents when recordInputs: true
        }),
        description: 'generate_content error-model stream-response',
        op: 'gen_ai.generate_content',
        origin: 'auto.ai.google_genai',
        status: 'internal_error',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-streaming.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates google genai streaming spans with sendDefaultPii: false', async () => {
      await createRunner().ignore('event').expect({ transaction: EXPECTED_TRANSACTION_STREAMING }).start().completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-streaming.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates google genai streaming spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_STREAMING_PII_TRUE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-message-truncation.mjs',
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
                    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_content',
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
                    [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
                    [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-1.5-flash',
                    // Messages should be present (truncation happened) and should be a JSON array with parts
                    [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.stringMatching(
                      /^\[\{"role":"user","parts":\[\{"text":"C+"\}\]\}\]$/,
                    ),
                    [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 3,
                  }),
                  description: 'generate_content gemini-1.5-flash',
                  op: 'gen_ai.generate_content',
                  origin: 'auto.ai.google_genai',
                  status: 'ok',
                }),
                // Second call: Last message is small and kept without truncation
                expect.objectContaining({
                  data: expect.objectContaining({
                    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_content',
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
                    [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
                    [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-1.5-flash',
                    // Small message should be kept intact
                    [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: JSON.stringify([
                      {
                        role: 'user',
                        parts: [{ text: 'This is a small message that fits within the limit' }],
                      },
                    ]),
                    [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 3,
                  }),
                  description: 'generate_content gemini-1.5-flash',
                  op: 'gen_ai.generate_content',
                  origin: 'auto.ai.google_genai',
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
