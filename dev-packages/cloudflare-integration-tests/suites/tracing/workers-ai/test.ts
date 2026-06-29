import { expect, it } from 'vitest';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_RESPONSE_STREAMING_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
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
                [GEN_AI_SYSTEM_ATTRIBUTE]: 'cloudflare.workers_ai',
                [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
                [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: '@cf/meta/llama-3.1-8b-instruct',
                [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.7,
                [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: 100,
                [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 12,
                [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 7,
                [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 19,
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
                [GEN_AI_SYSTEM_ATTRIBUTE]: 'cloudflare.workers_ai',
                [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
                [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: '@cf/meta/llama-3.1-8b-instruct',
                [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
                [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
                [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 12,
                [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 7,
                [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 19,
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
