import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';
import { APP, attr, byName, expectCommonChatAttributes, isChatSpan } from './utils';

// `tee`, `pipeTo` and `pipeThrough` take their reader from internal slots rather than the public
// `getReader`, so they bypass a stream instrumented only through `getReader` and the async iterator.
// These cover the two an app is realistically built on: teeing to relay and persist at once, and
// piping through a transform to forward tokens to a client.

test('records a gen_ai span for a teed stream, once', async ({ baseURL, request }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP, 'GET /chat-stream-tee');

  const response = await request.get(`${baseURL}/chat-stream-tee`);
  expect(response.status()).toBe(200);

  // Both branches receive the same stream.
  const { left, right } = await response.json();
  expect(left).toBeTruthy();
  expect(left).toBe(right);

  const spans = await spansPromise;
  const chatSpans = spans.filter(isChatSpan);

  // One span, not one per tee branch.
  expect(chatSpans).toHaveLength(1);
  const chatSpan = chatSpans[0]!;

  expectCommonChatAttributes(chatSpan);
  expect(attr(chatSpan, 'gen_ai.request.stream')).toBe(true);
  expect(attr(chatSpan, 'gen_ai.response.streaming')).toBe(true);

  // Nesting still holds on this drain path.
  const segment = spans.find(span => span.is_segment && span.name === 'GET /chat-stream-tee')!;
  const workflow = byName(spans, 'ai-tee-workflow');
  expect(chatSpan.parent_span_id).toBe(workflow.span_id);
  expect(chatSpan.trace_id).toBe(segment.trace_id);
});

test('records a gen_ai span for a stream relayed through a transform', async ({ baseURL, request }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP, 'GET /chat-stream-pipe');

  const response = await request.get(`${baseURL}/chat-stream-pipe`);
  expect(response.status()).toBe(200);
  expect((await response.json()).answer).toBeTruthy();

  const spans = await spansPromise;
  const chatSpan = spans.find(isChatSpan);

  expect(chatSpan).toBeDefined();
  expectCommonChatAttributes(chatSpan!);
  expect(attr(chatSpan!, 'gen_ai.response.streaming')).toBe(true);

  const segment = spans.find(span => span.is_segment && span.name === 'GET /chat-stream-pipe')!;
  const workflow = byName(spans, 'ai-pipe-workflow');
  expect(chatSpan!.parent_span_id).toBe(workflow.span_id);
  expect(chatSpan!.trace_id).toBe(segment.trace_id);
});
