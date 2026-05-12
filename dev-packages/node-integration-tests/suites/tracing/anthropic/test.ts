import { afterAll, describe, expect } from 'vitest';
import {
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
  };

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE = {
    transaction: 'main',
  };

  const EXPECTED_TRANSACTION_WITH_OPTIONS = {
    transaction: 'main',
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
        .expect({
          span: container => {
            expect(container.items).toHaveLength(4);
            const completionSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'msg_mock123',
            );
            expect(completionSpan).toBeDefined();
            expect(completionSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(completionSpan!.status).toBe('ok');
            expect(completionSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(completionSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(completionSpan!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');
            expect(completionSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(completionSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(completionSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(completionSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(100);
            expect(completionSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(completionSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(completionSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(completionSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);

            const errorSpan = container.items.find(span => span.name === 'chat error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(errorSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(errorSpan!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');
            expect(errorSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('error-model');

            const tokenCountingSpan = container.items.find(
              span =>
                span.name === 'chat claude-3-haiku-20240307' &&
                span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE] === undefined,
            );
            expect(tokenCountingSpan).toBeDefined();
            expect(tokenCountingSpan!.status).toBe('ok');
            expect(tokenCountingSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(tokenCountingSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');

            const modelsSpan = container.items.find(span => span.name === 'models claude-3-haiku-20240307');
            expect(modelsSpan).toBeDefined();
            expect(modelsSpan!.status).toBe('ok');
            expect(modelsSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('models');
            expect(modelsSpan!.attributes['sentry.op'].value).toBe('gen_ai.models');
            expect(modelsSpan!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');
            expect(modelsSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(modelsSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(modelsSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(modelsSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-with-response.mjs', 'instrument.mjs', (createRunner, test) => {
    test('preserves .withResponse() and .asResponse() for non-streaming and streaming', async () => {
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
            const nonStreamingSpans = container.items.filter(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'msg_withresponse',
            );
            expect(nonStreamingSpans).toHaveLength(2);
            for (const span of nonStreamingSpans) {
              expect(span.name).toBe('chat claude-3-haiku-20240307');
              expect(span.status).toBe('ok');
              expect(span.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
              expect(span.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            }

            const streamingSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'msg_stream_withresponse',
            );
            expect(streamingSpan).toBeDefined();
            expect(streamingSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(streamingSpan!.status).toBe('ok');
            expect(streamingSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates anthropic related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .expect({ event: EXPECTED_MODEL_ERROR })
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(5);
            const completionSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'msg_mock123',
            );
            expect(completionSpan).toBeDefined();
            expect(completionSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(completionSpan!.status).toBe('ok');

            const errorSpan = container.items.find(span => span.name === 'chat error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');

            const tokenCountingSpan = container.items.find(
              span =>
                span.name === 'chat claude-3-haiku-20240307' &&
                span.status === 'ok' &&
                span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE] === undefined,
            );
            expect(tokenCountingSpan).toBeDefined();
            expect(tokenCountingSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');

            const modelsSpan = container.items.find(span => span.name === 'models claude-3-haiku-20240307');
            expect(modelsSpan).toBeDefined();
            expect(modelsSpan!.status).toBe('ok');
            expect(modelsSpan!.attributes['sentry.op'].value).toBe('gen_ai.models');

            const streamingSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'msg_stream123',
            );
            expect(streamingSpan).toBeDefined();
            expect(streamingSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(streamingSpan!.status).toBe('ok');
            expect(streamingSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
          },
        })
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
        .expect({
          span: container => {
            expect(container.items).toHaveLength(5);
            const completionSpan = container.items.find(
              span =>
                span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value ===
                '[{"role":"user","content":"What is the capital of France?"}]',
            );
            expect(completionSpan).toBeDefined();
            expect(completionSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(completionSpan!.status).toBe('ok');
            expect(completionSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(completionSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(100);
            expect(completionSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(completionSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(completionSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(completionSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('msg_mock123');
            expect(completionSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE].value).toBe('Hello from Anthropic mock!');
            expect(completionSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(completionSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(completionSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(completionSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);
            expect(completionSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(completionSpan!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');

            const errorSpan = container.items.find(
              span =>
                span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value ===
                '[{"role":"user","content":"This will fail"}]',
            );
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.name).toBe('chat error-model');
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('error-model');

            const tokenCountingSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]?.value === '15',
            );
            expect(tokenCountingSpan).toBeDefined();
            expect(tokenCountingSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(tokenCountingSpan!.status).toBe('ok');
            expect(tokenCountingSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');

            const modelsSpan = container.items.find(span => span.name === 'models claude-3-haiku-20240307');
            expect(modelsSpan).toBeDefined();
            expect(modelsSpan!.status).toBe('ok');
            expect(modelsSpan!.attributes['sentry.op'].value).toBe('gen_ai.models');

            // TODO: messages.stream() should produce its own distinct gen_ai span, but it
            // currently does not (pre-existing bug). Once fixed, add an additional indexed span assertion.
            const streamingSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'msg_stream123',
            );
            expect(streamingSpan).toBeDefined();
            expect(streamingSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(streamingSpan!.status).toBe('ok');
            expect(streamingSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(streamingSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(streamingSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE].value).toBe(true);
            expect(streamingSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(streamingSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE].value).toBe('Hello from stream!');
            expect(streamingSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(streamingSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(streamingSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);
          },
        })
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
        .expect({
          span: container => {
            expect(container.items).toHaveLength(5);
            const completionSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'msg_mock123',
            );
            expect(completionSpan).toBeDefined();
            expect(completionSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(completionSpan!.status).toBe('ok');
            expect(completionSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(completionSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(completionSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();

            const errorSpan = container.items.find(span => span.name === 'chat error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');

            const tokenCountingSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]?.value === '15',
            );
            expect(tokenCountingSpan).toBeDefined();
            expect(tokenCountingSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(tokenCountingSpan!.status).toBe('ok');
            expect(tokenCountingSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(tokenCountingSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');

            const modelsSpan = container.items.find(span => span.name === 'models claude-3-haiku-20240307');
            expect(modelsSpan).toBeDefined();
            expect(modelsSpan!.status).toBe('ok');
            expect(modelsSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('models');
            expect(modelsSpan!.attributes['sentry.op'].value).toBe('gen_ai.models');
            expect(modelsSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(modelsSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(modelsSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(modelsSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');

            const streamingSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'msg_stream123',
            );
            expect(streamingSpan).toBeDefined();
            expect(streamingSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(streamingSpan!.status).toBe('ok');
            expect(streamingSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
          },
        })
        .expect({ event: EXPECTED_STREAM_EVENT_HANDLER_MESSAGE })
        .start()
        .completed();
    });
  });

  const EXPECTED_STREAM_SPANS_PII_FALSE = {
    transaction: 'main',
  };

  const EXPECTED_STREAM_SPANS_PII_TRUE = {
    transaction: 'main',
  };

  createEsmAndCjsTests(__dirname, 'scenario-stream.mjs', 'instrument.mjs', (createRunner, test) => {
    test('streams produce spans with token usage and metadata (PII false)', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_STREAM_SPANS_PII_FALSE })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const requestStreamSpans = container.items.filter(
              span => span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]?.value === true,
            );
            expect(requestStreamSpans).toHaveLength(2);
            for (const span of requestStreamSpans) {
              expect(span.name).toBe('chat claude-3-haiku-20240307');
              expect(span.status).toBe('ok');
              expect(span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE].value).toBe(true);
              expect(span.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
              expect(span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('msg_stream_1');
            }

            const detailedStreamSpan = requestStreamSpans.find(
              span => span.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]?.value === '["end_turn"]',
            );
            expect(detailedStreamSpan).toBeDefined();
            expect(detailedStreamSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(detailedStreamSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(detailedStreamSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe(
              'claude-3-haiku-20240307',
            );
            expect(detailedStreamSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe(
              'claude-3-haiku-20240307',
            );
            expect(detailedStreamSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(detailedStreamSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(detailedStreamSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);

            const messagesStreamSpan = container.items.find(
              span => span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] === undefined,
            );
            expect(messagesStreamSpan).toBeDefined();
            expect(messagesStreamSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(messagesStreamSpan!.status).toBe('ok');
            expect(messagesStreamSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(messagesStreamSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(messagesStreamSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe(
              'claude-3-haiku-20240307',
            );
            expect(messagesStreamSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(messagesStreamSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe(
              'claude-3-haiku-20240307',
            );
            expect(messagesStreamSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('msg_stream_1');
            expect(messagesStreamSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(messagesStreamSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(messagesStreamSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-stream.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('streams record response text when PII true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_STREAM_SPANS_PII_TRUE })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const requestStreamSpans = container.items.filter(
              span => span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]?.value === true,
            );
            expect(requestStreamSpans).toHaveLength(2);
            for (const span of requestStreamSpans) {
              expect(span.name).toBe('chat claude-3-haiku-20240307');
              expect(span.status).toBe('ok');
              expect(span.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
              expect(span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE].value).toBe(true);
              expect(span.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE].value).toBe('Hello from stream!');
            }

            const messagesStreamSpan = container.items.find(
              span => span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] === undefined,
            );
            expect(messagesStreamSpan).toBeDefined();
            expect(messagesStreamSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(messagesStreamSpan!.status).toBe('ok');
            expect(messagesStreamSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(messagesStreamSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE].value).toBe('Hello from stream!');
          },
        })
        .start()
        .completed();
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
          transaction: {},
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(1);
            const [firstSpan] = container.items;

            // [0] messages.create with tools — available tools + tool calls recorded with PII
            expect(firstSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE].value).toBe(EXPECTED_TOOLS_JSON);
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE].value).toBe(EXPECTED_TOOL_CALLS_JSON);
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
          transaction: {},
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(2);
            const streamingToolSpan = container.items.find(span => span.status === 'ok');
            expect(streamingToolSpan).toBeDefined();
            expect(streamingToolSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(streamingToolSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(streamingToolSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE].value).toBe(true);
            expect(streamingToolSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(streamingToolSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE].value).toBe(
              EXPECTED_TOOLS_JSON,
            );
            expect(streamingToolSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE].value).toBe(
              EXPECTED_TOOL_CALLS_JSON,
            );

            const errorSpan = container.items.find(span => span.status === 'error');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(errorSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
          },
        })
        .start()
        .completed();
    });
  });

  // Additional error scenarios - Streaming errors
  const EXPECTED_STREAM_ERROR_SPANS = {
    transaction: 'main',
  };

  createEsmAndCjsTests(__dirname, 'scenario-stream-errors.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('handles streaming errors correctly', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_STREAM_ERROR_SPANS })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(4);
            const createInitErrorSpan = container.items.find(
              span =>
                span.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]?.value === 'error-stream-init' &&
                span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]?.value === true,
            );
            expect(createInitErrorSpan).toBeDefined();
            expect(createInitErrorSpan!.name).toBe('chat error-stream-init');
            expect(createInitErrorSpan!.status).toBe('error');

            const streamInitErrorSpan = container.items.find(
              span =>
                span.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]?.value === 'error-stream-init' &&
                span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] === undefined,
            );
            expect(streamInitErrorSpan).toBeDefined();
            expect(streamInitErrorSpan!.name).toBe('chat error-stream-init');
            expect(streamInitErrorSpan!.status).toBe('error');

            const createMidwayErrorSpan = container.items.find(
              span =>
                span.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]?.value === 'error-stream-midway' &&
                span.status === 'ok',
            );
            expect(createMidwayErrorSpan).toBeDefined();
            expect(createMidwayErrorSpan!.name).toBe('chat error-stream-midway');
            expect(createMidwayErrorSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE].value).toBe(true);
            expect(createMidwayErrorSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(createMidwayErrorSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE].value).toBe('This stream will ');

            const streamMidwayErrorSpan = container.items.find(
              span =>
                span.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]?.value === 'error-stream-midway' &&
                span.status === 'error',
            );
            expect(streamMidwayErrorSpan).toBeDefined();
            expect(streamMidwayErrorSpan!.name).toBe('chat error-stream-midway');
            expect(streamMidwayErrorSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
          },
        })
        .start()
        .completed();
    });
  });

  // Additional error scenarios - Tool errors and model retrieval errors
  const EXPECTED_ERROR_SPANS = {
    transaction: 'main',
  };

  createEsmAndCjsTests(__dirname, 'scenario-errors.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('handles tool errors and model retrieval errors correctly', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_ERROR_SPANS })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const invalidFormatSpan = container.items.find(span => span.name === 'chat invalid-format');
            expect(invalidFormatSpan).toBeDefined();
            expect(invalidFormatSpan!.status).toBe('error');
            expect(invalidFormatSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('invalid-format');
            expect(invalidFormatSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');

            const modelErrorSpan = container.items.find(span => span.name === 'models nonexistent-model');
            expect(modelErrorSpan).toBeDefined();
            expect(modelErrorSpan!.status).toBe('error');
            expect(modelErrorSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('nonexistent-model');
            expect(modelErrorSpan!.attributes['sentry.op'].value).toBe('gen_ai.models');

            const toolSuccessSpan = container.items.find(span => span.name === 'chat claude-3-haiku-20240307');
            expect(toolSuccessSpan).toBeDefined();
            expect(toolSuccessSpan!.status).toBe('ok');
            expect(toolSuccessSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE].value).toContain('tool_ok_1');
          },
        })
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
            },
          })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(2);
              const smallMsgValue = JSON.stringify([
                { role: 'user', content: 'This is a small message that fits within the limit' },
              ]);
              const truncatedSpan = container.items.find(span =>
                span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.match(
                  /^\[\{"role":"user","content":"C+"\}\]$/,
                ),
              );
              expect(truncatedSpan).toBeDefined();
              expect(truncatedSpan!.name).toBe('chat claude-3-haiku-20240307');
              expect(truncatedSpan!.status).toBe('ok');
              expect(truncatedSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
              expect(truncatedSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
              expect(truncatedSpan!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');
              expect(truncatedSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
              expect(truncatedSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
              expect(truncatedSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);

              const smallMessageSpan = container.items.find(
                span => span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value === smallMsgValue,
              );
              expect(smallMessageSpan).toBeDefined();
              expect(smallMessageSpan!.name).toBe('chat claude-3-haiku-20240307');
              expect(smallMessageSpan!.status).toBe('ok');
              expect(smallMessageSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
              expect(smallMessageSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
              expect(smallMessageSpan!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');
              expect(smallMessageSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
              expect(smallMessageSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe(
                'claude-3-haiku-20240307',
              );
              expect(smallMessageSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(__dirname, 'scenario-media-truncation.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('truncates media attachment, keeping all other details', async () => {
      const expectedMediaMessages = JSON.stringify([
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: '[Blob substitute]',
              },
            },
          ],
        },
      ]);
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

            // [0] messages.create with media attachment — image data replaced, other fields preserved
            expect(firstSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(expectedMediaMessages);
            expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(firstSpan!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');
            expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(2);
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
        const expectedInstructions = JSON.stringify([{ type: 'text', content: 'You are a helpful assistant' }]);
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

              // [0] messages.create — system instructions extracted into dedicated attribute
              expect(firstSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE].value).toBe(expectedInstructions);
            },
          })
          .start()
          .completed();
      });
    },
  );

  const longContent = 'A'.repeat(50_000);
  const longStringInput = 'B'.repeat(50_000);

  const EXPECTED_TRANSACTION_NO_TRUNCATION = {
    transaction: 'main',
  };

  createEsmAndCjsTests(
    __dirname,
    'scenario-no-truncation.mjs',
    'instrument-no-truncation.mjs',
    (createRunner, test) => {
      test('does not truncate input messages when enableTruncation is false', async () => {
        const expectedAllMessages = JSON.stringify([
          { role: 'user', content: longContent },
          { role: 'assistant', content: 'Some reply' },
          { role: 'user', content: 'Follow-up question' },
        ]);
        const expectedLongString = JSON.stringify([longStringInput]);
        await createRunner()
          .ignore('event')
          .expect({ transaction: EXPECTED_TRANSACTION_NO_TRUNCATION })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(2);
              const conversationSpan = container.items.find(
                span => span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value === expectedAllMessages,
              );
              expect(conversationSpan).toBeDefined();
              expect(conversationSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);

              const longStringSpan = container.items.find(
                span => span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value === expectedLongString,
              );
              expect(longStringSpan).toBeDefined();
              expect(longStringSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(1);
            },
          })
          .start()
          .completed();
      });
    },
  );

  const streamingLongContent = 'A'.repeat(50_000);

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
              // Find the chat span by matching the start of the truncated content (the 'A' repeated messages).
              const chatSpan = spans.find(s =>
                s.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.startsWith('[{"role":"user","content":"AAAA'),
              );
              expect(chatSpan).toBeDefined();
              expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value.length).toBeLessThan(
                streamingLongContent.length,
              );
            },
          })
          .start()
          .completed();
      });
    },
  );
});
