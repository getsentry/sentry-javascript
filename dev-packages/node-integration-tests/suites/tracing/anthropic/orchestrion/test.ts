import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_STREAMING_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

// The origin distinguishes the orchestrion (diagnostics-channel) path from the
// OTel/proxy one (`auto.ai.anthropic`).
const ORCHESTRION_ORIGIN = 'auto.ai.orchestrion.anthropic';

describe('Anthropic integration (orchestrion)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, '../scenario.mjs', 'instrument-orchestrion.mjs', (createRunner, test) => {
    test('creates anthropic spans via the diagnostics-channel path', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            const completionSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'msg_mock123',
            );
            expect(completionSpan).toBeDefined();
            expect(completionSpan!.name).toBe('chat claude-3-haiku-20240307');
            expect(completionSpan!.status).toBe('ok');
            expect(completionSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: ORCHESTRION_ORIGIN,
            });
            expect(completionSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.chat',
            });
            expect(completionSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'chat',
            });
            expect(completionSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'anthropic' });
            expect(completionSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'claude-3-haiku-20240307',
            });
            expect(completionSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(completionSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 15,
            });
            expect(completionSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 25,
            });
            // Recording disabled: no inputs/outputs captured.
            expect(completionSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeUndefined();
            expect(completionSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeUndefined();

            const errorSpan = container.items.find(span => span.name === 'chat error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).not.toBe('ok');
            expect(errorSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: ORCHESTRION_ORIGIN,
            });

            const tokenCountingSpan = container.items.find(
              span =>
                span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]?.value === 'gen_ai.chat' &&
                span.status === 'ok' &&
                span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE] === undefined,
            );
            expect(tokenCountingSpan).toBeDefined();
            expect(tokenCountingSpan!.name).toBe('chat claude-3-haiku-20240307');

            const modelsSpan = container.items.find(span => span.name === 'models claude-3-haiku-20240307');
            expect(modelsSpan).toBeDefined();
            expect(modelsSpan!.status).toBe('ok');
            expect(modelsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
              type: 'string',
              value: 'gen_ai.models',
            });
            expect(modelsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: ORCHESTRION_ORIGIN,
            });

            // messages.create({ stream: true }) — the async-iterable `Stream` (`stream: true` in the request).
            const streamingCreateSpan = container.items.find(
              span =>
                span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'msg_stream123' &&
                span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]?.value === true,
            );
            expect(streamingCreateSpan).toBeDefined();
            expect(streamingCreateSpan!.status).toBe('ok');
            expect(streamingCreateSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: ORCHESTRION_ORIGIN,
            });
            expect(streamingCreateSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
              type: 'boolean',
              value: true,
            });
            expect(streamingCreateSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(streamingCreateSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 15,
            });
            expect(streamingCreateSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
              type: 'integer',
              value: 25,
            });
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, '../scenario.mjs', 'instrument-orchestrion-with-pii.mjs', (createRunner, test) => {
    test('records inputs and outputs when PII is enabled', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            const completionSpan = container.items.find(
              span => span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'msg_mock123',
            );
            expect(completionSpan).toBeDefined();
            expect(completionSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
              type: 'string',
              value: ORCHESTRION_ORIGIN,
            });
            expect(completionSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
              type: 'string',
              value: '[{"role":"user","content":"What is the capital of France?"}]',
            });
            expect(completionSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'Hello from Anthropic mock!',
            });

            const streamingCreateSpan = container.items.find(
              span =>
                span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'msg_stream123' &&
                span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE]?.value === true,
            );
            expect(streamingCreateSpan).toBeDefined();
            expect(streamingCreateSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'Hello from stream!',
            });
          },
        })
        .start()
        .completed();
    });
  });

  // `messages.stream()` returns a `MessageStream` emitter; `scenario.mjs` fires it without awaiting
  // completion, so a dedicated scenario awaits the `'end'` event to exercise the emitter span.
  createEsmAndCjsTests(
    __dirname,
    'scenario-messages-stream.mjs',
    'instrument-orchestrion-with-pii.mjs',
    (createRunner, test) => {
      test('creates a span for the messages.stream() emitter path', async () => {
        await createRunner()
          .ignore('event')
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // The emitter span from `stream()` itself carries no `stream` request param, unlike the
              // internal `messages.create({ stream: true })` the SDK issues under the hood.
              const messageStreamSpan = container.items.find(
                span =>
                  span.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]?.value === 'msg_stream123' &&
                  span.attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] === undefined,
              );
              expect(messageStreamSpan).toBeDefined();
              expect(messageStreamSpan!.name).toBe('chat claude-3-haiku-20240307');
              expect(messageStreamSpan!.status).toBe('ok');
              expect(messageStreamSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: ORCHESTRION_ORIGIN,
              });
              expect(messageStreamSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.chat',
              });
              expect(messageStreamSpan!.attributes[GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]).toEqual({
                type: 'boolean',
                value: true,
              });
              expect(messageStreamSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 10,
              });
              expect(messageStreamSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
                type: 'integer',
                value: 15,
              });
              expect(messageStreamSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'Hello from stream!',
              });
            },
          })
          .start()
          .completed();
      });
    },
  );
});
