import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('sentry.is_localhost', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
    // The runner always requests `http://localhost:<port>`, so only the `true` case is reachable
    // here. The `false` case is covered by the unit tests for `isLocalhostRequest`.
    test('is set on every span of a request served from localhost', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          span: container => {
            const segmentSpan = container.items.find(s => !!s.is_segment);
            const childSpan = container.items.find(s => s.name === 'child-span');

            expect(segmentSpan).toBeDefined();
            expect(childSpan).toBeDefined();

            for (const span of container.items) {
              expect(span.attributes['sentry.is_localhost']).toEqual({ type: 'boolean', value: true });
            }
          },
        })
        .start();

      await runner.makeRequest('get', '/test');

      await runner.completed();
    });
  });
});
