import { URL_PATH } from '@sentry/conventions/attributes';
import { getTunnelPath } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('managed tunnel', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
    test('drops the server span of tunnel requests', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            // Spans flush in order, so a span for the tunnel request would arrive in this container or before it.
            const segmentPaths = container.items.filter(item => item.is_segment).map(item => item.attributes[URL_PATH]);
            expect(segmentPaths).toEqual([{ type: 'string', value: '/after-tunnel' }]);
          },
        })
        .start();

      await runner.makeRequest('post', getTunnelPath('https://public@dsn.ingest.sentry.io/1337')!);
      await runner.makeRequest('get', '/after-tunnel');

      await runner.completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'server-intercept-false.mjs',
    'instrument-intercept-false.mjs',
    (createRunner, test) => {
      test('records nothing for tunnel requests the app answers, and keeps their scope data isolated', async () => {
        const runner = createRunner()
          .unordered()
          .expect({
            span: container => {
              const segmentPaths = container.items
                .filter(item => item.is_segment)
                .map(item => item.attributes[URL_PATH]);
              expect(segmentPaths).toEqual([{ type: 'string', value: '/after-tunnel' }]);
            },
          })
          .expect({
            event: event => {
              expect(event.exception?.values?.[0]?.value).toBe('after tunnel');
              expect(event.user?.id).toBeUndefined();
            },
          })
          .start();

        await runner.makeRequest('post', getTunnelPath('https://public@dsn.ingest.sentry.io/1337')!);
        await runner.makeRequest('get', '/after-tunnel');

        await runner.completed();
      });
    },
  );
});
