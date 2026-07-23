import { expect, test } from '@playwright/test';
import { waitForStreamedSpans } from '@sentry-internal/test-utils';

// gen_ai spans are emitted as a separate span-v2 envelope item (not inline on the transaction), so we
// assert on the streamed spans. Attribute values are wrapped as `{ value, type }` in the v2 format.
test('Instruments anthropic-ai automatically via orchestrion', async ({ baseURL }) => {
  const spansPromise = waitForStreamedSpans('nextjs-16-orchestrion', spans =>
    spans.some(span => span.attributes['sentry.origin']?.value === 'auto.ai.orchestrion.anthropic'),
  );

  await fetch(`${baseURL}/api/anthropic`);

  const spans = await spansPromise;

  const chatSpan = spans.find(span => span.name === 'chat claude-3-haiku-20240307');
  expect(chatSpan).toBeDefined();
  expect(chatSpan?.attributes['sentry.op']?.value).toBe('gen_ai.chat');
  expect(chatSpan?.attributes['sentry.origin']?.value).toBe('auto.ai.orchestrion.anthropic');
  expect(chatSpan?.attributes['gen_ai.system']?.value).toBe('anthropic');
  expect(chatSpan?.attributes['gen_ai.request.model']?.value).toBe('claude-3-haiku-20240307');
  expect(chatSpan?.attributes['gen_ai.usage.input_tokens']?.value).toBe(10);
  expect(chatSpan?.attributes['gen_ai.usage.output_tokens']?.value).toBe(15);
});
