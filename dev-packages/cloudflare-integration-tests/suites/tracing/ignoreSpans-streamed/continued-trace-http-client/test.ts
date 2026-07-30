import type { Envelope, SerializedStreamedSpanContainer } from '@sentry/core';
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { createTestServer } from '@sentry-internal/test-utils';
import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';

it('preserves a positive sampling decision when the outgoing fetch span is ignored', async ({ signal }) => {
  let outgoingSentryTrace: string | string[] | undefined;

  const [serverUrl, closeTestServer] = await createTestServer()
    .get('/outgoing', headers => {
      outgoingSentryTrace = headers['sentry-trace'];
      expect(headers['baggage']).toBe(
        'sentry-trace_id=12345678901234567890123456789012,sentry-sample_rate=1,sentry-sampled=true,sentry-public_key=public,sentry-sample_rand=0.5',
      );
    })
    .start();

  const runner = createRunner(__dirname)
    .withServerUrl(serverUrl)
    .expect(envelope => {
      const container = getSpanContainer(envelope);
      const serverSpan = container.items.find(item => item.attributes[SENTRY_OP]?.value === 'http.server');

      expect(serverSpan?.is_segment).toBe(true);
      expect(serverSpan?.trace_id).toBe('12345678901234567890123456789012');
      expect(outgoingSentryTrace).toBe(`12345678901234567890123456789012-${serverSpan?.span_id}-1`);
      expect(container.items.some(item => item.attributes[SENTRY_OP]?.value === 'http.client')).toBe(false);
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

function getSpanContainer(envelope: Envelope): SerializedStreamedSpanContainer {
  const spanItem = envelope[1].find(item => item[0].type === 'span');
  expect(spanItem).toBeDefined();
  return spanItem![1] as SerializedStreamedSpanContainer;
}
