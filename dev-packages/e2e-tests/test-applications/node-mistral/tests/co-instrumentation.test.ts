import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp } from '@sentry-internal/test-utils';
import { APP, attr, isChatSpan } from './utils';

// Mistral and dataloader are both instrumented through orchestrion, so one request that touches
// both proves the Mistral channels coexist with the rest of the injected set rather than displacing
// them. dataloader is also CommonJS where Mistral is ESM-only, so this covers both module formats
// going through the same transform in one process.
test('emits dataloader spans alongside gen_ai spans in one trace', async ({ baseURL, request }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP, 'GET /dataloader-and-chat');

  const response = await request.get(`${baseURL}/dataloader-and-chat?id=7`);
  expect(response.status()).toBe(200);
  expect((await response.json()).user).toEqual({ id: '7', name: 'user-7' });

  const spans = await spansPromise;
  const segment = spans.find(span => span.is_segment && span.name === 'GET /dataloader-and-chat')!;

  const chatSpan = spans.find(isChatSpan);
  const dataloaderSpans = spans.filter(span => attr(span, 'sentry.origin') === 'auto.db.dataloader');

  expect(chatSpan).toBeDefined();
  expect(dataloaderSpans.length).toBeGreaterThan(0);

  // `load` is recorded as a cache read.
  expect(dataloaderSpans.some(span => getSpanOp(span) === 'cache.get')).toBe(true);

  // Both instrumentations contribute to the same trace, under the same request.
  expect(chatSpan!.trace_id).toBe(segment.trace_id);
  for (const span of dataloaderSpans) {
    expect(span.trace_id).toBe(segment.trace_id);
  }
});
