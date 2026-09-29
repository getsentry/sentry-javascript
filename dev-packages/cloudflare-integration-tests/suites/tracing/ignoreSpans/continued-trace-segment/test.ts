import { createTestServer } from '@sentry-internal/test-utils';
import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';

it('propagates a negative sampling decision when the continued server segment is ignored', async ({ signal }) => {
  expect.assertions(3);

  const [serverUrl, closeTestServer] = await createTestServer()
    .get('/outgoing', headers => {
      expect(headers['sentry-trace']).toMatch(/^12345678901234567890123456789012-[\da-f]{16}-0$/);
      expect(headers['baggage']).toBe(
        'sentry-trace_id=12345678901234567890123456789012,sentry-sample_rate=1,sentry-sampled=false,sentry-public_key=public,sentry-sample_rand=0.5',
      );
    })
    .start();

  const runner = createRunner(__dirname).withServerUrl(serverUrl).start(signal);

  try {
    const response = await runner.makeRequest<{ status: string }>('get', '/', {
      headers: {
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage:
          'sentry-trace_id=12345678901234567890123456789012,sentry-sample_rate=1,sentry-sampled=true,sentry-public_key=public,sentry-sample_rand=0.5',
      },
    });

    expect(response?.status).toBe('ok');
  } finally {
    closeTestServer();
  }
});
