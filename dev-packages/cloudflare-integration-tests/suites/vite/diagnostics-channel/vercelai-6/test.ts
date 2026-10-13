import { expect, it } from 'vitest';
import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { createRunner } from '../../../../runner';

it('captures Vercel AI v6 spans via @sentry/cloudflare vercelAIIntegration', async ({ signal }) => {
  const runner = createRunner(__dirname).ignore('event').start(signal);

  // The request produces one segment span and the two gen_ai children. Waiting for all three rather
  // than for the segment: it ends last, but each envelope is its own request to the mock server, so
  // it can arrive before the envelope carrying the children this test asserts on.
  const spansPromise = runner.collectStreamedSpans(spansOfTrace => spansOfTrace.length === 3);

  await runner.makeRequest('get', '/');

  const spans = await spansPromise;

  expect(spans.filter(span => !span.is_segment)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'invoke_agent',
        is_segment: false,
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'gen_ai.invoke_agent' },
          'sentry.origin': { type: 'string', value: 'auto.vercelai.channel' },
          [GEN_AI_OPERATION_NAME]: { type: 'string', value: 'invoke_agent' },
          [GEN_AI_USAGE_INPUT_TOKENS]: { type: 'integer', value: 10 },
          [GEN_AI_USAGE_OUTPUT_TOKENS]: { type: 'integer', value: 20 },
          [GEN_AI_USAGE_TOTAL_TOKENS]: { type: 'integer', value: 30 },
        }),
      }),
      expect.objectContaining({
        name: 'generate_content mock-model-id',
        is_segment: false,
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'gen_ai.generate_content' },
          'sentry.origin': { type: 'string', value: 'auto.vercelai.channel' },
          [GEN_AI_OPERATION_NAME]: { type: 'string', value: 'generate_content' },
        }),
      }),
    ]),
  );
  expect(spans.filter(span => !span.is_segment)).toHaveLength(2);
});
