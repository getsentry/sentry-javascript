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
            const [firstSpan, secondSpan, thirdSpan, fourthSpan] = container.items;

            // [0] messages.create — basic message completion without PII
            expect(firstSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(firstSpan!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');
            expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(100);
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('msg_mock123');
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);

            // [1] messages.create with error-model — error handling
            expect(secondSpan!.name).toBe('chat error-model');
            expect(secondSpan!.status).toBe('error');
            expect(secondSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(secondSpan!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');
            expect(secondSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('error-model');

            // [2] messages.countTokens — token counting
            expect(thirdSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(thirdSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');

            // [3] models.retrieve
            expect(fourthSpan!.name).toBe('models claude-3-haiku-20240307');
            expect(fourthSpan!.status).toBe('ok');
            expect(fourthSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('models');
            expect(fourthSpan!.attributes['sentry.op'].value).toBe('gen_ai.models');
            expect(fourthSpan!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');
            expect(fourthSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(fourthSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
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
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] .withResponse() — non-streaming
            expect(firstSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('msg_withresponse');

            // [1] .asResponse() — non-streaming
            expect(secondSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('msg_withresponse');

            // [2] streaming .withResponse()
            expect(thirdSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('msg_stream_withresponse');
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
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
            const [firstSpan, secondSpan, thirdSpan, fourthSpan, fifthSpan] = container.items;

            // [0] messages.create — basic message completion
            expect(firstSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('msg_mock123');

            // [1] messages.create with error-model — error handling
            expect(secondSpan!.name).toBe('chat error-model');
            expect(secondSpan!.status).toBe('error');

            // [2] messages.countTokens — token counting
            expect(thirdSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');

            // [3] models.retrieve
            expect(fourthSpan!.name).toBe('models claude-3-haiku-20240307');
            expect(fourthSpan!.status).toBe('ok');
            expect(fourthSpan!.attributes['sentry.op'].value).toBe('gen_ai.models');

            // [4] messages.create stream: true + messages.stream (both share this span due to pre-existing bug)
            expect(fifthSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(fifthSpan!.status).toBe('ok');
            expect(fifthSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('msg_stream123');
            expect(fifthSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
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
            const [firstSpan, secondSpan, thirdSpan, fourthSpan, fifthSpan] = container.items;

            // [0] messages.create — basic message completion with PII
            expect(firstSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(100);
            expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
              '[{"role":"user","content":"What is the capital of France?"}]',
            );
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('msg_mock123');
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE].value).toBe('Hello from Anthropic mock!');
            expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(firstSpan!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');

            // [1] messages.create with error-model — error handling with PII
            expect(secondSpan!.name).toBe('chat error-model');
            expect(secondSpan!.status).toBe('error');
            expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
              '[{"role":"user","content":"This will fail"}]',
            );
            expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('error-model');

            // [2] messages.countTokens — token counting with PII (response text records input_tokens as "15")
            expect(thirdSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE].value).toBe('15');

            // [3] models.retrieve with PII
            expect(fourthSpan!.name).toBe('models claude-3-haiku-20240307');
            expect(fourthSpan!.status).toBe('ok');
            expect(fourthSpan!.attributes['sentry.op'].value).toBe('gen_ai.models');

            // [4] messages.create stream: true + messages.stream (both share this span due to pre-existing bug)
            // TODO: messages.stream() should produce its own distinct gen_ai span, but it
            // currently does not (pre-existing bug). Once fixed, add an additional indexed span assertion.
            expect(fifthSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(fifthSpan!.status).toBe('ok');
            expect(fifthSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(fifthSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(fifthSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE].value).toBe(true);
            expect(fifthSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(fifthSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('msg_stream123');
            expect(fifthSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE].value).toBe('Hello from stream!');
            expect(fifthSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(fifthSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(fifthSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);
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
            const [firstSpan, secondSpan, thirdSpan, fourthSpan, fifthSpan] = container.items;

            // [0] messages.create — chat span with custom PII options (input messages + response text recorded)
            expect(firstSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('msg_mock123');

            // [1] messages.create with error-model — error handling
            expect(secondSpan!.name).toBe('chat error-model');
            expect(secondSpan!.status).toBe('error');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');

            // [2] messages.countTokens — token counting with options (response text = "15")
            expect(thirdSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(thirdSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE].value).toBe('15');

            // [3] models.retrieve with options
            expect(fourthSpan!.name).toBe('models claude-3-haiku-20240307');
            expect(fourthSpan!.status).toBe('ok');
            expect(fourthSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('models');
            expect(fourthSpan!.attributes['sentry.op'].value).toBe('gen_ai.models');
            expect(fourthSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(fourthSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');

            // [4] messages.create stream: true + messages.stream (share this span due to pre-existing bug)
            expect(fifthSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(fifthSpan!.status).toBe('ok');
            expect(fifthSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('msg_stream123');
            expect(fifthSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
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
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] messages.create with stream: true
            expect(firstSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE].value).toBe(true);
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('msg_stream_1');
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE].value).toBe('["end_turn"]');

            // [1] messages.stream (no request.stream attribute — distinguishes from the other two)
            expect(secondSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(secondSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(secondSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('msg_stream_1');
            expect(secondSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(secondSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(secondSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);

            // [2] messages.stream with redundant stream: true param
            expect(thirdSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE].value).toBe(true);
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE].value).toBe('msg_stream_1');
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
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] messages.create with stream: true — response text captured with PII
            expect(firstSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(firstSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE].value).toBe(true);
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE].value).toBe('Hello from stream!');

            // [1] messages.stream — response text captured with PII, no request.stream param
            expect(secondSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(secondSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE].value).toBe('Hello from stream!');

            // [2] messages.stream with redundant stream: true — response text captured with PII
            expect(thirdSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(thirdSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE].value).toBe(true);
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE].value).toBe('Hello from stream!');
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
            const [firstSpan, secondSpan] = container.items;

            // [0] messages.create(stream: true) with tools — available tools + tool calls recorded with PII
            expect(firstSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE].value).toBe(true);
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(firstSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE].value).toBe(EXPECTED_TOOLS_JSON);
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE].value).toBe(EXPECTED_TOOL_CALLS_JSON);

            // [1] messages.stream — currently records as error since messages.stream doesn't get
            //     iterable semantics through the mock; this preserves observed behavior.
            expect(secondSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(secondSpan!.status).toBe('error');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
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
            const [firstSpan, secondSpan, thirdSpan, fourthSpan] = container.items;

            // [0] messages.create(stream: true) error on stream init
            expect(firstSpan!.name).toBe('chat error-stream-init');
            expect(firstSpan!.status).toBe('error');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('error-stream-init');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE].value).toBe(true);

            // [1] messages.stream error on stream init (no request.stream param)
            expect(secondSpan!.name).toBe('chat error-stream-init');
            expect(secondSpan!.status).toBe('error');
            expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('error-stream-init');
            expect(secondSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();

            // [2] messages.create(stream: true) midway error — finishes 'ok' with partial text
            expect(thirdSpan!.name).toBe('chat error-stream-midway');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('error-stream-midway');
            expect(thirdSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE].value).toBe(true);
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE].value).toBe(true);
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE].value).toBe('This stream will ');

            // [3] messages.stream midway error — errors out
            expect(fourthSpan!.name).toBe('chat error-stream-midway');
            expect(fourthSpan!.status).toBe('error');
            expect(fourthSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('error-stream-midway');
            expect(fourthSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
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
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] messages.create with invalid-format — tool format error
            expect(firstSpan!.name).toBe('chat invalid-format');
            expect(firstSpan!.status).toBe('error');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('invalid-format');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');

            // [1] models.retrieve('nonexistent-model') — model retrieval error
            expect(secondSpan!.name).toBe('models nonexistent-model');
            expect(secondSpan!.status).toBe('error');
            expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('nonexistent-model');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.models');

            // [2] Successful tool usage (for comparison)
            expect(thirdSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE].value).toContain('tool_ok_1');
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
              const [firstSpan, secondSpan] = container.items;

              // [0] First call: last message is large and truncated (only C's remain, D's cropped)
              expect(firstSpan!.name).toBe('chat claude-3-haiku-20240307');
              expect(firstSpan!.status).toBe('ok');
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toMatch(
                /^\[\{"role":"user","content":"C+"\}\]$/,
              );
              expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
              expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
              expect(firstSpan!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');
              expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
              expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);

              // [1] Second call: last message is small and kept without truncation
              const smallMsgValue = JSON.stringify([
                { role: 'user', content: 'This is a small message that fits within the limit' },
              ]);
              expect(secondSpan!.name).toBe('chat claude-3-haiku-20240307');
              expect(secondSpan!.status).toBe('ok');
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(smallMsgValue);
              expect(secondSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
              expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
              expect(secondSpan!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');
              expect(secondSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
              expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-haiku-20240307');
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);
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
      test('extracts system instructions and preserves full multi-message input by default (enableTruncation unset)', async () => {
        const expectedInstructions = JSON.stringify([{ type: 'text', content: 'You are a helpful assistant' }]);
        const expectedMessages = JSON.stringify([
          { role: 'user', content: 'A'.repeat(50_000) },
          { role: 'assistant', content: 'Some reply' },
          { role: 'user', content: 'Follow-up question' },
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

              // [0] messages.create — system instructions extracted into dedicated attribute
              expect(firstSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE].value).toBe(expectedInstructions);
              // Default-off: no byte-truncation of the 50KB message and no message popping to keep-last-only.
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(expectedMessages);
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);
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
              const [firstSpan, secondSpan] = container.items;

              // [0] messages.create with multi-message conversation — all messages preserved
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(expectedAllMessages);
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);

              // [1] messages.create with long string input — not truncated
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(expectedLongString);
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(1);
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
            expect(container.items).toHaveLength(8);
            const [firstSpan, secondSpan, thirdSpan, fourthSpan, fifthSpan, sixthSpan, seventhSpan, eighthSpan] =
              container.items;

            // [0]–[5] express middleware + http.server spans
            expect(firstSpan!.name).toBe('query');
            expect(secondSpan!.name).toBe('expressInit');
            expect(thirdSpan!.name).toBe('jsonParser');
            expect(fourthSpan!.name).toBe('/anthropic/v1/messages');
            expect(fifthSpan!.name).toBe('POST /anthropic/v1/messages');
            expect(sixthSpan!.name).toBe('POST');

            // [6] messages.create — gen_ai.chat span with full (non-truncated) long content
            expect(seventhSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(seventhSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(seventhSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toContain(streamingLongContent);

            // [7] root 'main' function span
            expect(eighthSpan!.name).toBe('main');
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
              expect(container.items).toHaveLength(8);
              const [firstSpan, secondSpan, thirdSpan, fourthSpan, fifthSpan, sixthSpan, seventhSpan, eighthSpan] =
                container.items;

              // [0]–[5] express middleware + http.server spans
              expect(firstSpan!.name).toBe('query');
              expect(secondSpan!.name).toBe('expressInit');
              expect(thirdSpan!.name).toBe('jsonParser');
              expect(fourthSpan!.name).toBe('/anthropic/v1/messages');
              expect(fifthSpan!.name).toBe('POST /anthropic/v1/messages');
              expect(sixthSpan!.name).toBe('POST');

              // [6] messages.create — gen_ai.chat span whose content is truncated despite streaming
              expect(seventhSpan!.name).toBe('chat claude-3-haiku-20240307');
              expect(seventhSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
              expect(seventhSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toMatch(
                /^\[\{"role":"user","content":"AAAA/,
              );
              expect(seventhSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value.length).toBeLessThan(
                streamingLongContent.length,
              );

              // [7] root 'main' function span
              expect(eighthSpan!.name).toBe('main');
            },
          })
          .start()
          .completed();
      });
    },
  );
});
