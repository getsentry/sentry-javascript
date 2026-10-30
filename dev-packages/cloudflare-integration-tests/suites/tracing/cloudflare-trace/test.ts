import type { Event, SerializedStreamedSpanContainer } from '@sentry/core';
import { expect, it } from 'vitest';
import { SHORT_UUID_MATCHER, UUID_MATCHER } from '../../../expect';
import { createRunner } from '../../../runner';
import { supports } from '../../../runtime';

// `Span.spanContext()` ships in workerd 1.20261009.1. Without it, the Worker responds with `null`.
it.runIf(supports({ minWorkerd: '1.20261009.1' }))(
  'uses the Cloudflare trace for the error event and the segment span',
  async ({ signal }) => {
    const errorEvents: Event[] = [];
    const spanContainers: SerializedStreamedSpanContainer[] = [];

    const runner = createRunner(__dirname)
      .unordered()
      .expect(envelope => {
        expect(envelope[1][0][0].type).toBe('event');
        errorEvents.push(envelope[1][0][1] as Event);
      })
      .expect(envelope => {
        expect(envelope[1][0][0].type).toBe('span');
        spanContainers.push(envelope[1][0][1] as SerializedStreamedSpanContainer);
      })
      .start(signal);

    const cloudflareSpan = await runner.makeRequest<{ traceId: string; spanId: string } | null>('get', '/');
    await runner.completed();

    const segmentSpans = spanContainers.flatMap(container => container.items).filter(span => span.is_segment);
    expect(cloudflareSpan).toEqual({ traceId: UUID_MATCHER, spanId: SHORT_UUID_MATCHER });
    expect(errorEvents).toHaveLength(1);
    expect(segmentSpans).toHaveLength(1);
    expect(segmentSpans[0]?.trace_id).toBe(cloudflareSpan?.traceId);
    expect(segmentSpans[0]?.parent_span_id).toBe(cloudflareSpan?.spanId);
    expect(errorEvents[0]?.contexts?.trace?.trace_id).toBe(cloudflareSpan?.traceId);
  },
);

it.runIf(supports({ minWorkerd: '1.20261009.1' }))(
  'uses the Cloudflare trace for the error event when no span is sampled',
  async ({ signal }) => {
    const errorEvents: Event[] = [];

    const runner = createRunner(__dirname)
      .withWranglerArgs('--var', 'TRACES_SAMPLE_RATE:0')
      .expect(envelope => {
        expect(envelope[1][0][0].type).toBe('event');
        errorEvents.push(envelope[1][0][1] as Event);
      })
      .start(signal);

    const cloudflareSpan = await runner.makeRequest<{ traceId: string; spanId: string } | null>('get', '/');
    await runner.completed();

    expect(cloudflareSpan).toEqual({ traceId: UUID_MATCHER, spanId: SHORT_UUID_MATCHER });
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]?.contexts?.trace).toEqual({
      trace_id: cloudflareSpan?.traceId,
      span_id: SHORT_UUID_MATCHER,
      parent_span_id: cloudflareSpan?.spanId,
    });
  },
);

it.skipIf(supports({ minWorkerd: '1.20261009.1' }))(
  'starts its own trace on runtimes without `Span.spanContext()`',
  async ({ signal }) => {
    const errorEvents: Event[] = [];
    const spanContainers: SerializedStreamedSpanContainer[] = [];

    const runner = createRunner(__dirname)
      .unordered()
      .expect(envelope => {
        expect(envelope[1][0][0].type).toBe('event');
        errorEvents.push(envelope[1][0][1] as Event);
      })
      .expect(envelope => {
        expect(envelope[1][0][0].type).toBe('span');
        spanContainers.push(envelope[1][0][1] as SerializedStreamedSpanContainer);
      })
      .start(signal);

    const cloudflareSpan = await runner.makeRequest<{ traceId: string; spanId: string } | null>('get', '/');
    await runner.completed();

    const segmentSpans = spanContainers.flatMap(container => container.items).filter(span => span.is_segment);
    expect(cloudflareSpan).toBeNull();
    expect(errorEvents).toHaveLength(1);
    expect(segmentSpans).toHaveLength(1);
    expect(segmentSpans[0]?.trace_id).toEqual(UUID_MATCHER);
    expect(segmentSpans[0]?.parent_span_id).toBeUndefined();
    expect(errorEvents[0]?.contexts?.trace?.trace_id).toBe(segmentSpans[0]?.trace_id);
  },
);

it('continues an incoming Sentry trace instead of the Cloudflare trace', async ({ signal }) => {
  const errorEvents: Event[] = [];

  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => {
      expect(envelope[1][0][0].type).toBe('event');
      errorEvents.push(envelope[1][0][1] as Event);
    })
    .expect(envelope => {
      expect(envelope[1][0][0].type).toBe('span');
    })
    .start(signal);

  await runner.makeRequest('get', '/', {
    headers: { 'sentry-trace': '12345678901234567890123456789012-1234567890123456-1' },
  });
  await runner.completed();

  expect(errorEvents).toHaveLength(1);
  expect(errorEvents[0]?.contexts?.trace?.trace_id).toBe('12345678901234567890123456789012');
  expect(errorEvents[0]?.contexts?.trace?.parent_span_id).toBe('1234567890123456');
});
