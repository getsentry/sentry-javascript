import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';
import { getSpansFromEnvelope } from '../../../../spanUtils';

it('drops spans emitted through @opentelemetry/api when `enableOpenTelemetrySetup` is not enabled', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);
      const segmentSpan = spans.find(span => span.is_segment);
      const childSpans = spans.filter(span => !span.is_segment);

      expect(segmentSpan?.name).toBe('GET /');

      // Only the Sentry span survives. It re-parents onto the segment span, because the noop OTel
      // span it was nested under never became a real parent.
      expect(childSpans).toHaveLength(1);
      expect(childSpans[0]?.name).toBe('sentry child');
      expect(childSpans[0]?.parent_span_id).toBe(segmentSpan?.span_id);
      expect(childSpans[0]?.trace_id).toBe(segmentSpan?.trace_id);
      expect(childSpans[0]?.status).toBe('ok');
      expect(childSpans[0]?.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: 'manual' });
    })
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.completed();
});
