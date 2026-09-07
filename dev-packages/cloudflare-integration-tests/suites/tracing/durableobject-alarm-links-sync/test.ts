import { expect, it } from 'vitest';
import type { SerializedStreamedSpan } from '@sentry/core';
import { createRunner } from '../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../spanUtils';

it('sync alarm links to the trace that scheduled it via sentry.previous_trace', async ({ signal }) => {
  let setAlarmSpan: SerializedStreamedSpan | undefined;
  let alarmSpan: SerializedStreamedSpan | undefined;
  const testId = Date.now().toString();

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      // `/set-alarm` is a raw URL, so the streamed segment name keeps the method only.
      expect(segmentSpan?.name).toBe('GET');
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/set-alarm' });
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(segmentSpan?.name).toBe('setAlarm');
      expect(getSpanOp(segmentSpan!)).toBe('rpc');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({
        type: 'string',
        value: 'auto.faas.cloudflare.durable_object',
      });
      setAlarmSpan = segmentSpan;
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(segmentSpan?.name).toBe('alarm');
      expect(getSpanOp(segmentSpan!)).toBe('function');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({
        type: 'string',
        value: 'auto.faas.cloudflare.durable_object',
      });
      alarmSpan = segmentSpan;
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', `/set-alarm?id=${testId}`);
  await runner.completed();

  // This is the key assertion: even though the alarm handler is synchronous,
  // sentry.previous_trace should still be set because we await the linkPromise
  // before teardown in the sync path
  const previousTrace = alarmSpan?.attributes['sentry.previous_trace']?.value as string | undefined;

  expect(previousTrace).toBeDefined();
  expect(previousTrace).toMatch(/^[a-f0-9]{32}-[a-f0-9]{16}-[01]$/);

  const [linkedTraceId] = previousTrace!.split('-');
  expect(linkedTraceId).toBe(setAlarmSpan?.trace_id);
});
