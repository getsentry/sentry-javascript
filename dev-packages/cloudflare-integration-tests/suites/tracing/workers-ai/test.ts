import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { expect, it } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
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

      // The transaction event is framework-generated and carries non-deterministic fields
      // (random ports, ids, timestamps, sdk version), so we assert the stable subset.
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: 'GET /',
          transaction_info: { source: 'route' },
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'http.server',
              origin: 'auto.http.cloudflare',
              status: 'ok',
            }),
          }),
          spans: [
            expect.objectContaining({
              description: 'chat @cf/meta/llama-3.1-8b-instruct',
              op: 'gen_ai.chat',
              origin: 'auto.ai.cloudflare.workers_ai',
              data: {
                'sentry.origin': 'auto.ai.cloudflare.workers_ai',
                'sentry.op': 'gen_ai.chat',
                [GEN_AI_PROVIDER_NAME]: 'cloudflare.workers_ai',
                [GEN_AI_OPERATION_NAME]: 'chat',
                [GEN_AI_REQUEST_MODEL]: '@cf/meta/llama-3.1-8b-instruct',
                [GEN_AI_REQUEST_TEMPERATURE]: 0.7,
                [GEN_AI_REQUEST_MAX_TOKENS]: 100,
                [GEN_AI_USAGE_INPUT_TOKENS]: 12,
                [GEN_AI_USAGE_OUTPUT_TOKENS]: 7,
                [GEN_AI_USAGE_TOTAL_TOKENS]: 19,
                // collect input and output messages
                [GEN_AI_SYSTEM_INSTRUCTIONS]: '[{"type":"text","content":"You are a helpful assistant."}]',
                [GEN_AI_INPUT_MESSAGES]: '[{"role":"user","content":"What is the capital of France?"}]',
                [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
                [GEN_AI_OUTPUT_MESSAGES]:
                  '[{"role":"assistant","parts":[{"type":"text","content":"The capital of France is Paris."}]}]',
                [GEN_AI_RESPONSE_TEXT]: 'The capital of France is Paris.',
              },
            }),
          ],
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

      expect(transactionEvent).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: 'GET /stream',
          transaction_info: { source: 'url' },
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'http.server',
              origin: 'auto.http.cloudflare',
              status: 'ok',
            }),
          }),
          spans: [
            expect.objectContaining({
              description: 'chat @cf/meta/llama-3.1-8b-instruct',
              op: 'gen_ai.chat',
              origin: 'auto.ai.cloudflare.workers_ai',
              data: {
                'sentry.origin': 'auto.ai.cloudflare.workers_ai',
                'sentry.op': 'gen_ai.chat',
                [GEN_AI_PROVIDER_NAME]: 'cloudflare.workers_ai',
                [GEN_AI_OPERATION_NAME]: 'chat',
                [GEN_AI_REQUEST_MODEL]: '@cf/meta/llama-3.1-8b-instruct',
                [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
                [GEN_AI_RESPONSE_STREAMING]: true,
                [GEN_AI_USAGE_INPUT_TOKENS]: 12,
                [GEN_AI_USAGE_OUTPUT_TOKENS]: 7,
                [GEN_AI_USAGE_TOTAL_TOKENS]: 19,
                [GEN_AI_INPUT_MESSAGES]: '[{"role":"user","content":"What is the capital of France?"}]',
                [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
                // Accumulated from the streamed chunks rather than read off a single response body.
                [GEN_AI_OUTPUT_MESSAGES]:
                  '[{"role":"assistant","parts":[{"type":"text","content":"The capital of France is Paris."}]}]',
                [GEN_AI_RESPONSE_TEXT]: 'The capital of France is Paris.',
              },
            }),
          ],
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
