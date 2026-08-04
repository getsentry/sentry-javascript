import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { GEN_AI_REQUEST_STREAM_ATTRIBUTE } from '../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('Anthropic integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_STREAM_EVENT_HANDLER_MESSAGE = {
    message: 'stream event from user-added event listener captured',
  };

  createEsmAndCjsTests(__dirname, 'scenario-with-response.mjs', 'instrument.mjs', (createRunner, test) => {
    test('preserves .withResponse() and .asResponse() for non-streaming and streaming', async () => {
      await createRunner()
        .expect({
          transaction: {
            transaction: 'main',
          },
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const nonStreamingSpans = container.items.filter(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'msg_withresponse',
            );
            expect(nonStreamingSpans).toHaveLength(2);
            for (const span of nonStreamingSpans) {
              expect(span.name).toBe('chat claude-3-haiku-20240307');
              expect(span.status).toBe('ok');
              expect(span.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
              expect(span.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-haiku-20240307');
            }

            const streamingSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'msg_stream_withresponse',
            );
            expect(streamingSpan).toBeDefined();
            expect(streamingSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(streamingSpan!.status).toBe('ok');
            expect(streamingSpan!.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates anthropic related spans with genAI recording disabled', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const completionSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'msg_mock123',
            );
            expect(completionSpan).toBeDefined();
            expect(completionSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(completionSpan!.status).toBe('ok');

            const errorSpan = container.items.find(span => span.name === 'chat error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');

            const streamingSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'msg_stream123',
            );
            expect(streamingSpan).toBeDefined();
            expect(streamingSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(streamingSpan!.status).toBe('ok');
            expect(streamingSpan!.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
          },
        })
        .expect({ event: EXPECTED_STREAM_EVENT_HANDLER_MESSAGE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates anthropic related spans with genAI recording enabled', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const completionSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'msg_mock123',
            );
            expect(completionSpan).toBeDefined();
            expect(completionSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(completionSpan!.status).toBe('ok');
            expect(completionSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
            expect(completionSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
            expect(completionSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-haiku-20240307');
            expect(completionSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.7);
            expect(completionSpan!.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('claude-3-haiku-20240307');
            expect(completionSpan!.attributes[GEN_AI_RESPONSE_ID].value).toBe('msg_mock123');
            expect(completionSpan!.attributes[GEN_AI_RESPONSE_TEXT].value).toBe('Hello from Anthropic mock!');
            expect(completionSpan!.attributes[GEN_AI_INPUT_MESSAGES].value).toBe(
              '[{"role":"user","content":"What is the capital of France?"}]',
            );
            expect(completionSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
            expect(completionSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(10);
            expect(completionSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(15);
            expect(completionSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(25);
            expect(completionSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(completionSpan!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');

            const errorSpan = container.items.find(
              span => span.attributes[GEN_AI_INPUT_MESSAGES]?.value === '[{"role":"user","content":"This will fail"}]',
            );
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.name).toBe('chat error-model');
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('error-model');

            // TODO: messages.stream() should produce its own distinct gen_ai span, but it
            // currently does not (pre-existing bug). Once fixed, add an additional indexed span assertion.
            const streamingSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'msg_stream123',
            );
            expect(streamingSpan).toBeDefined();
            expect(streamingSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(streamingSpan!.status).toBe('ok');
            expect(streamingSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
            expect(streamingSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-haiku-20240307');
            expect(streamingSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE].value).toBe(true);
            expect(streamingSpan!.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
            expect(streamingSpan!.attributes[GEN_AI_RESPONSE_TEXT].value).toBe('Hello from stream!');
            expect(streamingSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(10);
            expect(streamingSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(15);
            expect(streamingSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(25);
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
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const completionSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'msg_mock123',
            );
            expect(completionSpan).toBeDefined();
            expect(completionSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(completionSpan!.status).toBe('ok');
            expect(completionSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(completionSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
            expect(completionSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toBeDefined();

            const errorSpan = container.items.find(span => span.name === 'chat error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');

            const streamingSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'msg_stream123',
            );
            expect(streamingSpan).toBeDefined();
            expect(streamingSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(streamingSpan!.status).toBe('ok');
            expect(streamingSpan!.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
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
              expect(span.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
              expect(span.attributes[GEN_AI_RESPONSE_ID].value).toBe('msg_stream_1');
            }

            const detailedStreamSpan = requestStreamSpans.find(
              span => span.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value === '["end_turn"]',
            );
            expect(detailedStreamSpan).toBeDefined();
            expect(detailedStreamSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
            expect(detailedStreamSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
            expect(detailedStreamSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-haiku-20240307');
            expect(detailedStreamSpan!.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('claude-3-haiku-20240307');
            expect(detailedStreamSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(10);
            expect(detailedStreamSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(15);
            expect(detailedStreamSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(25);

            const messagesStreamSpan = container.items.find(
              span => span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] === undefined,
            );
            expect(messagesStreamSpan).toBeDefined();
            expect(messagesStreamSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(messagesStreamSpan!.status).toBe('ok');
            expect(messagesStreamSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
            expect(messagesStreamSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
            expect(messagesStreamSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-haiku-20240307');
            expect(messagesStreamSpan!.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
            expect(messagesStreamSpan!.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('claude-3-haiku-20240307');
            expect(messagesStreamSpan!.attributes[GEN_AI_RESPONSE_ID].value).toBe('msg_stream_1');
            expect(messagesStreamSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(10);
            expect(messagesStreamSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(15);
            expect(messagesStreamSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(25);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-stream.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('streams record response text when PII true', async () => {
      await createRunner()
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
              expect(span.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
              expect(span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE].value).toBe(true);
              expect(span.attributes[GEN_AI_RESPONSE_TEXT].value).toBe('Hello from stream!');
            }

            const messagesStreamSpan = container.items.find(
              span => span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] === undefined,
            );
            expect(messagesStreamSpan).toBeDefined();
            expect(messagesStreamSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(messagesStreamSpan!.status).toBe('ok');
            expect(messagesStreamSpan!.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
            expect(messagesStreamSpan!.attributes[GEN_AI_RESPONSE_TEXT].value).toBe('Hello from stream!');
          },
        })
        .start()
        .completed();
    });
  });

  // Instrumenting the client must not hide its own methods from an outer wrapper (e.g. another
  // library instrumenting the same client). `messages.stream()` delegates to `create` through
  // `this`, so if our instrumentation rebinds `this` away from the client, that internal call is
  // never observed by the wrapper. Regression test for the deep-proxy `this` rebinding.
  createEsmAndCjsTests(__dirname, 'scenario-outer-wrapper.mjs', 'instrument.mjs', (createRunner, test) => {
    test('does not hide the client methods from an outer wrapper when stream() delegates internally', async () => {
      await createRunner()
        .expect({ event: { message: 'third-party wrapper observed messages.create' } })
        .start()
        .completed();
    });
  });

  // The stream dedup must only suppress the helper's own internal `create` delegation, not a
  // separate `create` a user makes from a stream event handler (which runs while the streaming
  // helper span is still the active span). Regression test for over-suppression.
  createEsmAndCjsTests(__dirname, 'scenario-stream-nested-create.mjs', 'instrument.mjs', (createRunner, test) => {
    test('traces a create() invoked from a stream event handler (dedup does not over-suppress)', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            const nestedSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'msg_nested',
            );
            expect(nestedSpan).toBeDefined();
            expect(nestedSpan.attributes['sentry.op'].value).toBe('gen_ai.chat');

            // The helper's own internal `create` delegation must be deduped: exactly one span
            // for the streamed response, not a duplicate child span.
            const streamingSpans = container.items.filter(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'msg_stream_1',
            );
            expect(streamingSpans).toHaveLength(1);
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
            expect(firstSpan!.attributes[GEN_AI_TOOL_DEFINITIONS].value).toBe(EXPECTED_TOOLS_JSON);
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS].value).toBe(EXPECTED_TOOL_CALLS_JSON);
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
        .expect({
          transaction: {},
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(2);
            for (const span of container.items) {
              expect(span.name).toBe('chat claude-3-haiku-20240307');
              expect(span.status).toBe('ok');
              expect(span.attributes['sentry.op'].value).toBe('gen_ai.chat');
              expect(span.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
              expect(span.attributes[GEN_AI_RESPONSE_FINISH_REASONS].value).toBe('["tool_use"]');
              expect(span.attributes[GEN_AI_TOOL_DEFINITIONS].value).toBe(EXPECTED_TOOLS_JSON);
              expect(span.attributes[GEN_AI_RESPONSE_TOOL_CALLS].value).toBe(EXPECTED_TOOL_CALLS_JSON);
            }

            // messages.create({ stream: true }) carries the request stream param; messages.stream() does not.
            const createStreamSpan = container.items.find(
              span => span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]?.value === true,
            );
            expect(createStreamSpan).toBeDefined();
            const messagesStreamSpan = container.items.find(
              span => span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] === undefined,
            );
            expect(messagesStreamSpan).toBeDefined();
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
        // Anthropic surfaces stream errors as events on a resolved stream rather than by rejecting,
        // so the instrumentation still reports them; the caller never sees them as a thrown error.
        .ignore('event')
        .expect({ transaction: EXPECTED_STREAM_ERROR_SPANS })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(4);
            const createInitErrorSpan = container.items.find(
              span =>
                span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'error-stream-init' &&
                span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]?.value === true,
            );
            expect(createInitErrorSpan).toBeDefined();
            expect(createInitErrorSpan!.name).toBe('chat error-stream-init');
            expect(createInitErrorSpan!.status).toBe('error');

            const streamInitErrorSpan = container.items.find(
              span =>
                span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'error-stream-init' &&
                span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] === undefined,
            );
            expect(streamInitErrorSpan).toBeDefined();
            expect(streamInitErrorSpan!.name).toBe('chat error-stream-init');
            expect(streamInitErrorSpan!.status).toBe('error');

            const createMidwayErrorSpan = container.items.find(
              span => span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'error-stream-midway' && span.status === 'ok',
            );
            expect(createMidwayErrorSpan).toBeDefined();
            expect(createMidwayErrorSpan!.name).toBe('chat error-stream-midway');
            expect(createMidwayErrorSpan!.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE].value).toBe(true);
            expect(createMidwayErrorSpan!.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
            expect(createMidwayErrorSpan!.attributes[GEN_AI_RESPONSE_TEXT].value).toBe('This stream will ');

            const streamMidwayErrorSpan = container.items.find(
              span => span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'error-stream-midway' && span.status === 'error',
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

  createEsmAndCjsTests(__dirname, 'scenario-errors.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('handles tool errors correctly', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(2);
            const invalidFormatSpan = container.items.find(span => span.name === 'chat invalid-format');
            expect(invalidFormatSpan).toBeDefined();
            expect(invalidFormatSpan!.status).toBe('error');
            expect(invalidFormatSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('invalid-format');
            expect(invalidFormatSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');

            const toolSuccessSpan = container.items.find(span => span.name === 'chat claude-3-haiku-20240307');
            expect(toolSuccessSpan).toBeDefined();
            expect(toolSuccessSpan!.status).toBe('ok');
            expect(toolSuccessSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS].value).toContain('tool_ok_1');
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
              expect(firstSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe(expectedInstructions);
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-span-streaming.mjs', (createRunner, test) => {
    test('creates anthropic related spans with span streaming enabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            const completionSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'msg_mock123',
            );
            expect(completionSpan).toBeDefined();
            expect(completionSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(completionSpan!.status).toBe('ok');
            expect(completionSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
            expect(completionSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-haiku-20240307');
            expect(completionSpan!.attributes[GEN_AI_INPUT_MESSAGES].value).toBe(
              '[{"role":"user","content":"What is the capital of France?"}]',
            );
            expect(completionSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
            expect(completionSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(completionSpan!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');
          },
        })
        .start()
        .completed();
    });
  });
});
