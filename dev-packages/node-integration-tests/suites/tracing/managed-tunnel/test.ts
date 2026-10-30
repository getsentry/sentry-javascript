import { URL_PATH } from '@sentry/conventions/attributes';
import { getTunnelPath } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('managed tunnel', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
    test('answers tunnel requests before the app, without a server span', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            // Spans flush in order, so a span for the tunnel request would arrive in this container or before it.
            const segmentPaths = container.items.filter(item => item.is_segment).map(item => item.attributes[URL_PATH]);
            expect(segmentPaths).toEqual([{ type: 'string', value: '/after-tunnel' }]);
          },
        })
        .start();

      // The tunnel rejects the empty body. The app would have answered with a 200.
      await runner.makeRequest('post', getTunnelPath('https://public@dsn.ingest.sentry.io/1337')!, {
        expectError: true,
      });
      await runner.makeRequest('get', '/after-tunnel');

      await runner.completed();
    });
  });
});
