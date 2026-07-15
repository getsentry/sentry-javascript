import { createTestServer } from '@sentry-internal/test-utils';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('ignoring a continued server segment (streaming)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
    const testPropagation = async (path: string): Promise<void> => {
      expect.assertions(3);

      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/outgoing', headers => {
          const sentryTrace = headers['sentry-trace'];
          const baggage = headers['baggage'];

          expect(sentryTrace).toMatch(/12345678901234567890123456789012-[\da-f]{16}-0/);
          expect(baggage).toBe(
            'sentry-trace_id=12345678901234567890123456789012,sentry-sample_rate=1,sentry-sampled=false,sentry-public_key=public,sentry-sample_rand=0.5',
          );
        })
        .start();
      const runner = createRunner().withEnv({ SERVER_URL }).start();

      try {
        const response = await runner.makeRequest<{ status: string }>('get', path, {
          headers: {
            'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
            baggage:
              'sentry-trace_id=12345678901234567890123456789012,sentry-sample_rate=1,sentry-sampled=true,sentry-public_key=public,sentry-sample_rand=0.5',
          },
        });

        expect(response.status).toBe('ok');
      } finally {
        closeTestServer();
      }
    };

    test('propagates a negative sampling decision to outgoing fetch requests', () => testPropagation('/ignored'));
    test('propagates a negative sampling decision to outgoing node:http requests', () =>
      testPropagation('/ignored-http'));
  });
});
