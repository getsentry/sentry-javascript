import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('httpServerSpans-streamed (no route)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
    test('names the server span after the request method, not the URL path', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            const serverSpan = container.items.find(
              item =>
                item.attributes['sentry.op']?.type === 'string' && item.attributes['sentry.op'].value === 'http.server',
            );

            expect(serverSpan).toBeDefined();
            expect(serverSpan?.is_segment).toBe(true);
            // Without a route the name must not carry the URL path.
            expect(serverSpan?.name).toBe('GET');
            expect(serverSpan?.attributes['sentry.segment.name.source']).toEqual({ type: 'string', value: 'url' });
            // The path is still available as an attribute, which is what `ignoreSpans`/`tracesSampler` match on.
            expect(serverSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/users/42' });
          },
        })
        .start();

      await runner.makeRequest('get', '/users/42');

      await runner.completed();
    });
  });
});
