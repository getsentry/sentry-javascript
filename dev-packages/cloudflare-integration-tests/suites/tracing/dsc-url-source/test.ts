import { expect, it } from 'vitest';
import { eventEnvelope } from '../../../expect';
import { createRunner } from '../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../spanUtils';

it('omits the span name from the DSC for url-source spans when tracing is enabled', async ({ signal }) => {
  const runner = createRunner(__dirname)
    // Error event: because tracing is enabled, the DSC carries the sampling fields. But the span
    // source is `url`, so the span name is omitted from the DSC (raw URLs may contain PII).
    .expect(
      eventEnvelope(
        {
          level: 'error',
          exception: {
            values: [
              {
                type: 'Error',
                value: 'Test error from URL-source worker',
                stacktrace: {
                  frames: expect.any(Array),
                },
                mechanism: { type: 'auto.http.cloudflare', handled: false },
              },
            ],
          },
          request: {
            cookies: {},
            headers: expect.any(Object),
            method: 'GET',
            url: expect.any(String),
          },
        },
        { includeSamplingFields: true, includeSampleRand: true, includeTransaction: false },
      ),
    )
    // Span envelope: proves we are NOT in TwP. The segment span is recorded with a `url` source,
    // and its own envelope header omits the transaction from the DSC as well.
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(envelope[0]).toEqual(
        expect.not.objectContaining({ trace: expect.objectContaining({ transaction: expect.anything() }) }),
      );
      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['sentry.segment.name.source']?.value).toBe('url');
      // A `url` source is high cardinality, so the streamed span name keeps the method only.
      expect(segmentSpan?.name).toBe('GET');
    })
    .unordered()
    .start(signal);
  await runner.makeRequest('get', '/error', { expectError: true });
  await runner.completed();
});
