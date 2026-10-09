import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../spanUtils';

// `MyWorkflow` is hand-wrapped in `./workflow` and only re-exported by the
// entry, so the transform's emitted `_INTERNAL_wrapUnlessInstrumented` guard
// must hand the manual wrap back instead of nesting a second wrapper. Nested
// workflow wrappers each run the step through their own client, producing TWO
// identical `step-one` spans, each individually well-formed, so the real check
// is the count assertion at the end.
//
// Ordering is anchored by a sentinel rather than by waiting: `/trigger`
// responds only after the workflow finished (every step envelope, including a
// duplicate, is flushed before then), and `/sentinel` is requested after that,
// so its span arrives a full request/response cycle behind any duplicate. Once
// the sentinel envelope has been matched, everything sent before it is known to
// have been delivered.
it('does not double-instrument an imported, already-wrapped Workflow', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => {
      const stepSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment && span.name === 'step-one');
      expect(getSpanOp(stepSpan!)).toBe('function');
      expect(stepSpan?.attributes['sentry.origin']).toEqual({
        type: 'string',
        value: 'auto.faas.cloudflare.workflow',
      });
    })
    .expect(envelope => {
      // The auto-wrapped default export's own segment span. `/trigger` is a raw URL, so the streamed
      // segment name keeps the method only.
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);
      expect(segmentSpan?.name).toBe('GET');
      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/trigger' });
    })
    // The sentinel is part of the expected set, so the runner keeps everything
    // alive (and keeps receiving envelopes) until it has arrived.
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/sentinel' });
    })
    .start(signal);

  await runner.makeRequest('get', '/trigger');
  await runner.makeRequest('get', '/sentinel');
  await runner.completed();

  const stepSpans = runner
    .getReceivedEnvelopes()
    .flatMap(envelope => getSpansFromEnvelope(envelope))
    .filter(span => span.name === 'step-one');
  expect(stepSpans).toHaveLength(1);
});
