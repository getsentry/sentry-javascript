import type { Event } from '@sentry/core';
import { HTTP_SERVER, RPC } from '@sentry/conventions/op';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../spanUtils';

it('runs the worker with the new module registry', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);
  expect(await runner.makeRequest<string>('get', '/import-meta-resolve')).toBe('function');
});

it('captures errors thrown by the fetch handler', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.exception?.values?.[0]).toEqual({
        type: 'Error',
        value: 'Error with the new module registry',
        stacktrace: { frames: expect.any(Array) },
        mechanism: { type: 'auto.http.cloudflare', handled: false },
      });
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/error', { expectError: true });
  await runner.completed();
});

it('sends the spans of the fetch handler', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);
  const spansPromise = runner.collectStreamedSpans(spansOfTrace => spansOfTrace.length === 2);

  await runner.makeRequest('get', '/');

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment);
  const childSpan = spans.find(span => span.name === 'test-span');

  expect(segmentSpan?.name).toBe('GET /');
  expect(getSpanOp(segmentSpan!)).toBe(HTTP_SERVER);
  expect(childSpan?.parent_span_id).toBe(segmentSpan?.span_id);
  expect(getSpanOp(childSpan!)).toBe('test');
});

it('traces Durable Object RPC calls', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);
      expect(segmentSpan?.name).toBe('sayHello');
      expect(getSpanOp(segmentSpan!)).toBe(RPC);
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/durable-object');
  expect(response).toBe('Hello, world');

  await runner.completed();
});
