import { createTestServer } from '@sentry-internal/test-utils';
import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../../spanUtils';

it('preserves a positive sampling decision across an ignored child span', async ({ signal }) => {
  const [serverUrl, closeTestServer] = await createTestServer()
    .get('/outgoing', headers => {
      expect(headers['sentry-trace']).toMatch(/^12345678901234567890123456789012-[\da-f]{16}-1$/);
      expect(headers['baggage']).toBe(
        'sentry-trace_id=12345678901234567890123456789012,sentry-sample_rate=1,sentry-sampled=true,sentry-public_key=public,sentry-sample_rand=0.5',
      );
    })
    .start();

  const runner = createRunner(__dirname)
    .withServerUrl(serverUrl)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);
      const serverSpan = spans.find(span => getSpanOp(span) === 'http.server');
      const fetchSpan = spans.find(span => getSpanOp(span) === 'http.client');

      expect(serverSpan?.is_segment).toBe(true);
      expect(serverSpan?.trace_id).toBe('12345678901234567890123456789012');
      expect(fetchSpan?.parent_span_id).toBe(serverSpan?.span_id);
      expect(spans.some(span => span.name === 'ignored-child')).toBe(false);
    })
    .start(signal);

  try {
    const response = await runner.makeRequest<{ status: string }>('get', '/', {
      headers: {
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage:
          'sentry-trace_id=12345678901234567890123456789012,sentry-sample_rate=1,sentry-sampled=true,sentry-public_key=public,sentry-sample_rand=0.5',
      },
    });

    expect(response?.status).toBe('ok');
    await runner.completed();
  } finally {
    closeTestServer();
  }
});
