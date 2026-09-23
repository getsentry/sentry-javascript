import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../node-integration-tests/utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

// The runner always requests `http://localhost:<port>`, so only the `true` case is reachable here.
// The `false` case is covered by the unit tests for `isLocalhostRequest`.
test('sets sentry.is_localhost on every streamed span', async () => {
  const runner = createRunner(__dirname, 'index.ts')
    .withMockSentryServer()
    .unordered()
    .expect({
      span: container => {
        expect(container.items.some(span => span.is_segment)).toBe(true);
        expect(container.items.some(span => span.name === 'child-span')).toBe(true);

        for (const span of container.items) {
          expect(span.attributes['sentry.is_localhost']).toEqual({ value: true, type: 'boolean' });
        }
      },
    })
    .start();

  await runner.makeRequest('get', '/');
  await runner.completed();
});
