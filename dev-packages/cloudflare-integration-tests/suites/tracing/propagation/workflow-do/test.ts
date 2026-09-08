import { expect, it } from 'vitest';
import type { SerializedStreamedSpan } from '@sentry/core';
import { createRunner } from '../../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../../spanUtils';

it('traces a workflow that calls a durable object with the same trace id', async ({ signal }) => {
  let workflowSpan: SerializedStreamedSpan | undefined;
  let doSpan: SerializedStreamedSpan | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(segmentSpan?.name).toBe('workflow-env-test');
      expect(getSpanOp(segmentSpan!)).toBe('function');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({
        type: 'string',
        value: 'auto.faas.cloudflare.workflow',
      });
      workflowSpan = segmentSpan;
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      // `/workflow-test` is a raw URL, so the streamed segment name keeps the method only.
      expect(segmentSpan?.name).toBe('GET');
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/workflow-test' });
      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
      doSpan = segmentSpan;
    })
    .unordered()
    .start(signal);
  await runner.makeRequest('get', '/workflow/trigger');
  await runner.completed();

  expect(workflowSpan?.trace_id).toBeDefined();
  expect(doSpan?.trace_id).toBe(workflowSpan?.trace_id);
  expect(doSpan?.parent_span_id).toBe(workflowSpan?.span_id);
});
