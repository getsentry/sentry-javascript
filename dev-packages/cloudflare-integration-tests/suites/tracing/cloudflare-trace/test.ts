import type { Event, SerializedStreamedSpanContainer } from '@sentry/core';
import { createRequire } from 'module';
import { expect, it } from 'vitest';
import { SHORT_UUID_MATCHER } from '../../../expect';
import { createRunner } from '../../../runner';

// `wrangler dev` runs the workerd of its own miniflare. `Span.spanContext()` ships in workerd 1.20261009.1, so the
// pinned wrangler runs these tests without it and the latest wrangler runs them with it.
const wranglerRequire = createRequire(createRequire(__filename).resolve('wrangler/package.json'));
const miniflareRequire = createRequire(wranglerRequire.resolve('miniflare/package.json'));
const [, workerdDate = 0, workerdPatch = 0] = (miniflareRequire('workerd/package.json') as { version: string }).version
  .split('.')
  .map(Number);
const HAS_SPAN_CONTEXT = workerdDate > 20261009 || (workerdDate === 20261009 && workerdPatch >= 1);

const VALID_TRACE_ID = expect.stringMatching(/^(?!0{32})[\da-f]{32}$/);
// Without `Span.spanContext()`, the Worker responds with `null` and the SDK starts its own trace. On a runtime with it,
// a `null` response fails the test, so the `VALID_TRACE_ID` fallbacks below apply only to older runtimes.
const EXPECTED_CLOUDFLARE_SPAN = HAS_SPAN_CONTEXT
  ? expect.objectContaining({ traceId: VALID_TRACE_ID, spanId: SHORT_UUID_MATCHER })
  : null;

it('uses the Cloudflare trace for the error event and the segment span', async ({ signal }) => {
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
  expect(cloudflareSpan).toEqual(EXPECTED_CLOUDFLARE_SPAN);
  expect(errorEvents).toHaveLength(1);
  expect(segmentSpans).toHaveLength(1);
  expect(segmentSpans[0]?.trace_id).toEqual(cloudflareSpan?.traceId ?? VALID_TRACE_ID);
  expect(segmentSpans[0]?.parent_span_id).toBe(cloudflareSpan?.spanId);
  expect(errorEvents[0]?.contexts?.trace?.trace_id).toBe(segmentSpans[0]?.trace_id);
});

it('uses the Cloudflare trace for the error event when no span is sampled', async ({ signal }) => {
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

  expect(cloudflareSpan).toEqual(EXPECTED_CLOUDFLARE_SPAN);
  expect(errorEvents).toHaveLength(1);
  expect(errorEvents[0]?.contexts?.trace).toEqual({
    trace_id: cloudflareSpan?.traceId ?? VALID_TRACE_ID,
    span_id: SHORT_UUID_MATCHER,
    parent_span_id: cloudflareSpan?.spanId,
  });
});

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
