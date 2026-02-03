import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import {
  ANTHROPIC_AI_RESPONSE_TIMESTAMP_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
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

describe('Anthropic integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION_DEFAULT_PII_FALSE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - basic message completion without PII
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.anthropic',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.7,
          [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: 100,
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'msg_mock123',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 25,
        }),
        description: 'chat claude-3-haiku-20240307',
        op: 'gen_ai.chat',
        origin: 'auto.ai.anthropic',
        status: 'ok',
      }),
      // Second span - error handling
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.anthropic',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'error-model',
        }),
        description: 'chat error-model',
        op: 'gen_ai.chat',
        origin: 'auto.ai.anthropic',
        status: 'internal_error',
      }),
      // Third span - token counting (no response.text because recordOutputs=false by default)
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.anthropic',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
        }),
        description: 'chat claude-3-haiku-20240307',
        op: 'gen_ai.chat',
        origin: 'auto.ai.anthropic',
        status: 'ok',
      }),
      // Fourth span - models.retrieve
      expect.objectContaining({
        data: expect.objectContaining({
          [ANTHROPIC_AI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2024-05-08T05:20:00.000Z',
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'models',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.models',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.anthropic',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
        }),
        description: 'models claude-3-haiku-20240307',
        op: 'gen_ai.models',
        origin: 'auto.ai.anthropic',
        status: 'ok',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - basic message completion with PII
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: 100,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","content":"What is the capital of France?"}]',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.7,
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'msg_mock123',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: 'Hello from Anthropic mock!',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 25,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.anthropic',
        }),
        description: 'chat claude-3-haiku-20240307',
        op: 'gen_ai.chat',
        origin: 'auto.ai.anthropic',
        status: 'ok',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'http.request.method': 'POST',
          'http.request.method_original': 'POST',
          'http.response.header.content-length': 247,
          'http.response.status_code': 200,
          'otel.kind': 'CLIENT',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.node_fetch',
          'url.path': '/anthropic/v1/messages',
          'url.query': '',
          'url.scheme': 'http',
        }),
        op: 'http.client',
        origin: 'auto.http.otel.node_fetch',
        status: 'ok',
      }),

      // Second - error handling with PII
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","content":"This will fail"}]',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'error-model',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.anthropic',
        }),
        description: 'chat error-model',
        op: 'gen_ai.chat',
        origin: 'auto.ai.anthropic',
        status: 'internal_error',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'http.request.method': 'POST',
          'http.request.method_original': 'POST',
          'http.response.header.content-length': 15,
          'http.response.status_code': 404,
          'otel.kind': 'CLIENT',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.node_fetch',
          'url.path': '/anthropic/v1/messages',
          'url.query': '',
          'url.scheme': 'http',
        }),
        op: 'http.client',
        origin: 'auto.http.otel.node_fetch',
        status: 'not_found',
      }),

      // Third - token counting with PII (response.text is present because sendDefaultPii=true enables recordOutputs)
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","content":"What is the capital of France?"}]',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: '15',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.anthropic',
        }),
        description: 'chat claude-3-haiku-20240307',
        op: 'gen_ai.chat',
        origin: 'auto.ai.anthropic',
        status: 'ok',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'http.request.method': 'POST',
          'http.request.method_original': 'POST',
          'http.response.header.content-length': 19,
          'http.response.status_code': 200,
          'otel.kind': 'CLIENT',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.node_fetch',
          'url.path': '/anthropic/v1/messages/count_tokens',
          'url.query': '',
          'url.scheme': 'http',
        }),
        op: 'http.client',
        origin: 'auto.http.otel.node_fetch',
        status: 'ok',
      }),

      // Fourth - models.retrieve with PII
      expect.objectContaining({
        data: expect.objectContaining({
          [ANTHROPIC_AI_RESPONSE_TIMESTAMP_ATTRIBUTE]: '2024-05-08T05:20:00.000Z',
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'models',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.models',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.anthropic',
        }),
        description: 'models claude-3-haiku-20240307',
        op: 'gen_ai.models',
        origin: 'auto.ai.anthropic',
        status: 'ok',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'http.request.method': 'GET',
          'http.request.method_original': 'GET',
          'http.response.header.content-length': 123,
          'http.response.status_code': 200,
          'otel.kind': 'CLIENT',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.node_fetch',
          'url.path': '/anthropic/v1/models/claude-3-haiku-20240307',
          'url.query': '',
          'url.scheme': 'http',
          'user_agent.original': 'Anthropic/JS 0.63.0',
        }),
        op: 'http.client',
        origin: 'auto.http.otel.node_fetch',
        status: 'ok',
      }),

      // Fifth - messages.create with stream: true
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","content":"What is the capital of France?"}]',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'msg_stream123',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: 'Hello from stream!',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 25,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.anthropic',
        }),
        description: 'chat claude-3-haiku-20240307 stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.anthropic',
        status: 'ok',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'http.request.method': 'POST',
          'http.request.method_original': 'POST',
          'http.response.status_code': 200,
          'otel.kind': 'CLIENT',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.node_fetch',
          'url.path': '/anthropic/v1/messages',
          'url.query': '',
          'url.scheme': 'http',
          'user_agent.original': 'Anthropic/JS 0.63.0',
        }),
        op: 'http.client',
        origin: 'auto.http.otel.node_fetch',
        status: 'ok',
      }),

      // Sixth - messages.stream
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
        }),
        description: 'chat claude-3-haiku-20240307 stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.anthropic',
        status: 'ok',
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
      // Check token counting with options
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String), // Should include messages when recordInputs: true
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: '15', // Present because recordOutputs=true is set in options
        }),
        op: 'gen_ai.chat',
      }),
      // Check models.retrieve with options
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'models',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
        }),
        op: 'gen_ai.models',
        description: 'models claude-3-haiku-20240307',
      }),
    ]),
  };

  const EXPECTED_MODEL_ERROR = {
    exception: {
      values: [
        {
          type: 'Error',
          value: '404 Model not found',
        },
      ],
    },
  };

  const EXPECTED_STREAM_EVENT_HANDLER_MESSAGE = {
    message: 'stream event from user-added event listener captured',
  };

  createEsmAndCjsTests(__dirname, 'scenario-manual-client.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates anthropic related spans when manually insturmenting client', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates anthropic related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .expect({ event: EXPECTED_MODEL_ERROR })
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE })
        .expect({ event: EXPECTED_STREAM_EVENT_HANDLER_MESSAGE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates anthropic related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .expect({ event: EXPECTED_MODEL_ERROR })
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE })
        .expect({ event: EXPECTED_STREAM_EVENT_HANDLER_MESSAGE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('creates anthropic related spans with custom options', async () => {
      await createRunner()
        .expect({ event: EXPECTED_MODEL_ERROR })
        .expect({ transaction: EXPECTED_TRANSACTION_WITH_OPTIONS })
        .expect({ event: EXPECTED_STREAM_EVENT_HANDLER_MESSAGE })
        .start()
        .completed();
    });
  });

  const EXPECTED_STREAM_SPANS_PII_FALSE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // messages.create with stream: true
      expect.objectContaining({
        description: 'chat claude-3-haiku-20240307 stream-response',
        op: 'gen_ai.chat',
        data: expect.objectContaining({
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'msg_stream_1',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 25,
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["end_turn"]',
        }),
      }),
      // messages.stream
      expect.objectContaining({
        description: 'chat claude-3-haiku-20240307 stream-response',
        op: 'gen_ai.chat',
        data: expect.objectContaining({
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'msg_stream_1',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 25,
        }),
      }),
      // messages.stream with redundant stream: true param
      expect.objectContaining({
        description: 'chat claude-3-haiku-20240307 stream-response',
        op: 'gen_ai.chat',
        data: expect.objectContaining({
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'msg_stream_1',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 25,
        }),
      }),
    ]),
  };

  const EXPECTED_STREAM_SPANS_PII_TRUE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      expect.objectContaining({
        description: 'chat claude-3-haiku-20240307 stream-response',
        op: 'gen_ai.chat',
        data: expect.objectContaining({
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          // streamed text concatenated
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: 'Hello from stream!',
        }),
      }),
      expect.objectContaining({
        description: 'chat claude-3-haiku-20240307 stream-response',
        op: 'gen_ai.chat',
        data: expect.objectContaining({
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: 'Hello from stream!',
        }),
      }),
      expect.objectContaining({
        description: 'chat claude-3-haiku-20240307 stream-response',
        op: 'gen_ai.chat',
        data: expect.objectContaining({
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: 'Hello from stream!',
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-stream.mjs', 'instrument.mjs', (createRunner, test) => {
    test('streams produce spans with token usage and metadata (PII false)', async () => {
      await createRunner().ignore('event').expect({ transaction: EXPECTED_STREAM_SPANS_PII_FALSE }).start().completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-stream.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('streams record response text when PII true', async () => {
      await createRunner().ignore('event').expect({ transaction: EXPECTED_STREAM_SPANS_PII_TRUE }).start().completed();
    });
  });

  // Non-streaming tool calls + available tools (PII true)
  createEsmAndCjsTests(__dirname, 'scenario-tools.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('non-streaming sets available tools and tool calls with PII', async () => {
      const EXPECTED_TOOLS_JSON =
        '[{"name":"weather","description":"Get the weather by city","input_schema":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}]';
      const EXPECTED_TOOL_CALLS_JSON =
        '[{"type":"tool_use","id":"tool_weather_1","name":"weather","input":{"city":"Paris"}}]';
      await createRunner()
        .ignore('event')
        .expect({
          transaction: {
            spans: expect.arrayContaining([
              expect.objectContaining({
                op: 'gen_ai.chat',
                data: expect.objectContaining({
                  [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: EXPECTED_TOOLS_JSON,
                  [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: EXPECTED_TOOL_CALLS_JSON,
                }),
              }),
            ]),
          },
        })
        .start()
        .completed();
    });
  });

  // Streaming tool calls + available tools (PII true)
  createEsmAndCjsTests(__dirname, 'scenario-stream-tools.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('streaming sets available tools and tool calls with PII', async () => {
      const EXPECTED_TOOLS_JSON =
        '[{"name":"weather","description":"Get weather","input_schema":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}]';
      const EXPECTED_TOOL_CALLS_JSON =
        '[{"type":"tool_use","id":"tool_weather_2","name":"weather","input":{"city":"Paris"}}]';
      await createRunner()
        .ignore('event')
        .expect({
          transaction: {
            spans: expect.arrayContaining([
              expect.objectContaining({
                description: expect.stringContaining('stream-response'),
                op: 'gen_ai.chat',
                data: expect.objectContaining({
                  [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: EXPECTED_TOOLS_JSON,
                  [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: EXPECTED_TOOL_CALLS_JSON,
                }),
              }),
            ]),
          },
        })
        .start()
        .completed();
    });
  });

  // Additional error scenarios - Streaming errors
  const EXPECTED_STREAM_ERROR_SPANS = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // Error with messages.create on stream initialization
      expect.objectContaining({
        description: 'chat error-stream-init stream-response',
        op: 'gen_ai.chat',
        status: 'internal_error', // Actual status coming from the instrumentation
        data: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'error-stream-init',
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
        }),
      }),
      // Error with messages.stream on stream initialization
      expect.objectContaining({
        description: 'chat error-stream-init stream-response',
        op: 'gen_ai.chat',
        status: 'internal_error', // Actual status coming from the instrumentation
        data: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'error-stream-init',
        }),
      }),
      // Error midway with messages.create on streaming - note: The stream is started successfully
      // so we get a successful span with the content that was streamed before the error
      expect.objectContaining({
        description: 'chat error-stream-midway stream-response',
        op: 'gen_ai.chat',
        status: 'ok',
        data: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'error-stream-midway',
          [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: 'This stream will ', // We received some data before error
        }),
      }),
      // Error midway with messages.stream - same behavior, we get a span with the streamed data
      expect.objectContaining({
        description: 'chat error-stream-midway stream-response',
        op: 'gen_ai.chat',
        status: 'ok',
        data: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'error-stream-midway',
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: 'This stream will ', // We received some data before error
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-stream-errors.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('handles streaming errors correctly', async () => {
      await createRunner().ignore('event').expect({ transaction: EXPECTED_STREAM_ERROR_SPANS }).start().completed();
    });
  });

  // Additional error scenarios - Tool errors and model retrieval errors
  const EXPECTED_ERROR_SPANS = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // Invalid tool format error
      expect.objectContaining({
        description: 'chat invalid-format',
        op: 'gen_ai.chat',
        status: 'internal_error',
        data: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'invalid-format',
        }),
      }),
      // Model retrieval error
      expect.objectContaining({
        description: 'models nonexistent-model',
        op: 'gen_ai.models',
        status: 'internal_error',
        data: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'nonexistent-model',
        }),
      }),
      // Successful tool usage (for comparison)
      expect.objectContaining({
        description: 'chat claude-3-haiku-20240307',
        op: 'gen_ai.chat',
        status: 'ok',
        data: expect.objectContaining({
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
          [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: expect.stringContaining('tool_ok_1'),
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-errors.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('handles tool errors and model retrieval errors correctly', async () => {
      await createRunner().ignore('event').expect({ transaction: EXPECTED_ERROR_SPANS }).start().completed();
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
                    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.anthropic',
                    [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
                    [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
                    [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 3,
                    // Messages should be present (truncation happened) and should be a JSON array
                    [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.stringMatching(/^\[\{"role":"user","content":"C+"\}\]$/),
                  }),
                  description: 'chat claude-3-haiku-20240307',
                  op: 'gen_ai.chat',
                  origin: 'auto.ai.anthropic',
                  status: 'ok',
                }),
                // Second call: Last message is small and kept without truncation
                expect.objectContaining({
                  data: expect.objectContaining({
                    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.anthropic',
                    [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
                    [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
                    [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 3,
                    // Small message should be kept intact
                    [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: JSON.stringify([
                      { role: 'user', content: 'This is a small message that fits within the limit' },
                    ]),
                  }),
                  description: 'chat claude-3-haiku-20240307',
                  op: 'gen_ai.chat',
                  origin: 'auto.ai.anthropic',
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

  createEsmAndCjsTests(__dirname, 'scenario-media-truncation.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('truncates media attachment, keeping all other details', async () => {
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
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.anthropic',
                  [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
                  [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
                  [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 2,
                  // Only the last message (with filtered media) should be kept
                  [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: JSON.stringify([
                    {
                      role: 'user',
                      content: [
                        {
                          type: 'image',
                          source: {
                            type: 'base64',
                            media_type: 'image/png',
                            data: '[Filtered]',
                          },
                        },
                      ],
                    },
                  ]),
                }),
                description: 'chat claude-3-haiku-20240307',
                op: 'gen_ai.chat',
                origin: 'auto.ai.anthropic',
                status: 'ok',
              }),
            ]),
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
