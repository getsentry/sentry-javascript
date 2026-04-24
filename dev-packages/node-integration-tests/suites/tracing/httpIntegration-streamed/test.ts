import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('httpIntegration-streamed', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
    test('infers sentry.op http.server on streamed server spans', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            const serverSpan = container.items.find(
              item =>
                item.attributes?.['sentry.op']?.type === 'string' &&
                item.attributes['sentry.op'].value === 'http.server',
            );

            expect(serverSpan).toBeDefined();
            expect(serverSpan?.is_segment).toBe(true);
          },
        })
        .start();

      await runner.makeRequest('get', '/test');

      await runner.completed();
    });
  });
});
