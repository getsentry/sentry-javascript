import { GEN_AI_PROVIDER_NAME } from '@sentry/conventions/attributes';
import { expect, it } from 'vitest';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_RESPONSE_STREAMING_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { createRunner } from '../../../runner';

// These tests are not exhaustive because the instrumentation is
// already tested in the core unit tests and we merely want to test
// that the instrumentation does not break in our cloudflare SDK.

it('traces a basic Workers AI text generation request', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as any;
      expect(transactionEvent.transaction).toBe('GET /');

      const container = envelope[1]?.[1]?.[1] as any;
      expect(container).toBeDefined();
      expect(container.items).toHaveLength(1);

      expect(container.items[0]).toEqual(
        expect.objectContaining({
          name: 'chat @cf/meta/llama-3.1-8b-instruct',
          status: 'ok',
          is_segment: false,
          attributes: {
            'sentry.origin': { value: 'auto.ai.cloudflare.workers_ai', type: 'string' },
            'sentry.op': { value: 'gen_ai.chat', type: 'string' },
            [GEN_AI_PROVIDER_NAME]: { value: 'cloudflare.workers_ai', type: 'string' },
            [GEN_AI_OPERATION_NAME_ATTRIBUTE]: { value: 'chat', type: 'string' },
            [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: { value: '@cf/meta/llama-3.1-8b-instruct', type: 'string' },
            [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: { value: 0.7, type: 'double' },
            [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: { value: 100, type: 'integer' },
            [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: { value: 12, type: 'integer' },
            [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: { value: 7, type: 'integer' },
            [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: { value: 19, type: 'integer' },
          },
        }),
      );
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});

it('traces a streaming Workers AI text generation request', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as any;
      expect(transactionEvent.transaction).toBe('GET /stream');

      const container = envelope[1]?.[1]?.[1] as any;
      expect(container).toBeDefined();
      expect(container.items).toHaveLength(1);

      expect(container.items[0]).toEqual(
        expect.objectContaining({
          name: 'chat @cf/meta/llama-3.1-8b-instruct',
          status: 'ok',
          is_segment: false,
          attributes: {
            'sentry.origin': { value: 'auto.ai.cloudflare.workers_ai', type: 'string' },
            'sentry.op': { value: 'gen_ai.chat', type: 'string' },
            [GEN_AI_PROVIDER_NAME]: { value: 'cloudflare.workers_ai', type: 'string' },
            [GEN_AI_OPERATION_NAME_ATTRIBUTE]: { value: 'chat', type: 'string' },
            [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: { value: '@cf/meta/llama-3.1-8b-instruct', type: 'string' },
            [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: { value: true, type: 'boolean' },
            [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: { value: true, type: 'boolean' },
            [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: { value: 12, type: 'integer' },
            [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: { value: 7, type: 'integer' },
            [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: { value: 19, type: 'integer' },
          },
        }),
      );
    })
    .start(signal);
  await runner.makeRequest('get', '/stream');
  await runner.completed();
});

// The Workers AI integration deliberately does not call `captureException` itself.
// When a `run` call fails, the error must bubble up out of the fetch handler and be
// reported by the top-level Cloudflare instrumentation instead — so it shows up in
// Sentry exactly once, with the `auto.http.cloudflare` mechanism.
it('bubbles up Workers AI errors to be captured by the top-level handler', async ({ signal }) => {
  const runner = createRunner(__dirname)
    // A failing run still produces a (sampled) transaction; we only care about the error event here.
    .ignore('transaction')
    .expect(envelope => {
      const errorEvent = envelope[1]?.[0]?.[1] as any;

      expect(errorEvent).toEqual(
        expect.objectContaining({
          level: 'error',
          exception: {
            values: [
              expect.objectContaining({
                type: 'Error',
                value: 'Model not found',
                stacktrace: {
                  frames: expect.any(Array),
                },
                mechanism: { type: 'auto.http.cloudflare', handled: false },
              }),
            ],
          },
          request: expect.objectContaining({
            method: 'GET',
            url: expect.any(String),
          }),
        }),
      );
    })
    .start(signal);
  await runner.makeRequest('get', '/error', { expectError: true });
  await runner.completed();
});
