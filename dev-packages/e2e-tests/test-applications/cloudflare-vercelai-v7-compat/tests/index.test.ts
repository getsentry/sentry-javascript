import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpans } from '@sentry-internal/test-utils';

test('captures Vercel AI v7 spans with nodejs_compat using tracing channels', async ({ baseURL }) => {
  // gen_ai spans are extracted into a separate span v2 envelope item
  const genAiSpansPromise = waitForStreamedSpans('cloudflare-vercelai-v7-compat', spans =>
    spans.some(span => getSpanOp(span) === 'gen_ai.invoke_agent'),
  );

  const response = await fetch(`${baseURL}/generate`);

  expect(response.status).toBe(200);

  const genAiSpans = await genAiSpansPromise;

  expect(genAiSpans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'invoke_agent',
        attributes: expect.objectContaining({
          'gen_ai.operation.name': { value: 'invoke_agent', type: 'string' },
          'gen_ai.usage.input_tokens': { value: 10, type: 'integer' },
          'gen_ai.usage.output_tokens': { value: 20, type: 'integer' },
          'gen_ai.usage.total_tokens': { value: 30, type: 'integer' },
          'sentry.op': { value: 'gen_ai.invoke_agent', type: 'string' },
          'sentry.origin': { value: 'auto.vercelai.channel', type: 'string' },
        }),
      }),
      expect.objectContaining({
        name: 'generate_content mock-model-id',
        attributes: expect.objectContaining({
          'gen_ai.operation.name': { value: 'generate_content', type: 'string' },
          'gen_ai.usage.input_tokens': { value: 10, type: 'integer' },
          'gen_ai.usage.output_tokens': { value: 20, type: 'integer' },
          'gen_ai.usage.total_tokens': { value: 30, type: 'integer' },
          'sentry.op': { value: 'gen_ai.generate_content', type: 'string' },
          'sentry.origin': { value: 'auto.vercelai.channel', type: 'string' },
        }),
      }),
    ]),
  );
});
