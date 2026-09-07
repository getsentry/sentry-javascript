import type { Envelope } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../spanUtils';

// Regression test for https://github.com/getsentry/sentry-javascript/issues/20030
// When a Durable Object method calls Sentry.startSpan multiple times, those spans
// must appear as children of the DO segment span. The first invocation always worked;
// the second invocation on the same DO instance previously lost its child spans
// because the client was disposed after the first call.
it('sends child spans on repeated Durable Object calls', async ({ signal }) => {
  function assertDoWorkEnvelope(envelope: Envelope): void {
    const spans = getSpansFromEnvelope(envelope);
    const segmentSpan = spans.find(span => span.is_segment);

    expect(segmentSpan?.name).toBe('doWork');
    expect(getSpanOp(segmentSpan!)).toBe('rpc');
    expect(segmentSpan?.attributes['sentry.origin']).toEqual({
      type: 'string',
      value: 'auto.faas.cloudflare.durable_object',
    });

    // All 5 child spans should be present
    const taskSpans = spans.filter(span => getSpanOp(span) === 'task');
    expect(taskSpans).toHaveLength(5);
    expect(taskSpans.map(span => span.name).sort()).toEqual(['task-1', 'task-2', 'task-3', 'task-4', 'task-5']);

    // All child spans share the segment trace_id
    for (const span of taskSpans) {
      expect(span.trace_id).toBe(segmentSpan?.trace_id);
    }
  }

  function assertOuterRequestEnvelope(envelope: Envelope): void {
    const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

    expect(segmentSpan?.name).toBe('GET /');
    expect(getSpanOp(segmentSpan!)).toBe('http.server');
    expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
  }

  const runner = createRunner(__dirname).start(signal);

  // Make 5 requests and assert that the envelopes are received and validated.
  await runner.makeRequestAndWaitForEnvelope('get', '/', [assertDoWorkEnvelope, assertOuterRequestEnvelope]);
  await runner.makeRequestAndWaitForEnvelope('get', '/', [assertDoWorkEnvelope, assertOuterRequestEnvelope]);
  await runner.makeRequestAndWaitForEnvelope('get', '/', [assertDoWorkEnvelope, assertOuterRequestEnvelope]);
  await runner.makeRequestAndWaitForEnvelope('get', '/', [assertDoWorkEnvelope, assertOuterRequestEnvelope]);
  await runner.makeRequestAndWaitForEnvelope('get', '/', [assertDoWorkEnvelope, assertOuterRequestEnvelope]);
});
