import { createTestServer } from '@sentry-internal/test-utils';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';
import { SENTRY_OP } from '@sentry/conventions/attributes';

describe('ignoring an HTTP client child of a continued server segment (streaming)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
    const testPropagation = async (path: string): Promise<void> => {
      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/outgoing', headers => {
          expect
            .soft(headers['sentry-trace'])
            .toEqual(expect.stringMatching(/^12345678901234567890123456789012-[\da-f]{16}-1$/));

          expect(headers['baggage']).toBe(
            'sentry-trace_id=12345678901234567890123456789012,sentry-sample_rate=1,sentry-sampled=true,sentry-public_key=public,sentry-sample_rand=0.5',
          );
        })
        .start();

      const runner = createRunner()
        .withEnv({ SERVER_URL })
        .unignore('client_report')
        .expect({
          client_report: {
            discarded_events: [{ category: 'span', quantity: 1, reason: 'ignored' }],
          },
        })
        .expect({
          span: container => {
            const httpServerSpan = container.items.find(item => item.attributes[SENTRY_OP]?.value === 'http.server');

            expect(httpServerSpan?.is_segment).toBe(true);
            expect(httpServerSpan?.trace_id).toBe('12345678901234567890123456789012');

            expect(container.items.some(item => item.attributes[SENTRY_OP]?.value === 'http.client')).toBe(false);
          },
        })
        .start();

      try {
        const response = await runner.makeRequest<{ status: string }>('get', path, {
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
    };

    test('preserves the positive sampling decision on the outgoing fetch request', () =>
      testPropagation('/ignored-http-client'));

    test('preserves the positive sampling decision on the outgoing node:http request', () =>
      testPropagation('/ignored-node-http-client'));
  });
});
