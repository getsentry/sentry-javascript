import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('express with http import', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('it works when importing the http module', async () => {
      const runner = createRunner()
        // `/test` calls `/test2` on the same server, so both requests share one trace and their
        // spans are flushed together in a single envelope.
        .expect({
          span: container => {
            const segmentNames = container.items.filter(item => item.is_segment).map(item => item.name);
            expect(segmentNames).toEqual(['GET /test2', 'GET /test']);
          },
        })
        .expect({
          span: container => {
            expect(container.items.find(item => item.is_segment)?.name).toBe('GET /test3');
          },
        })
        .start();
      await runner.makeRequest('get', '/test');
      await runner.makeRequest('get', '/test3');
      await runner.completed();
    });
  });
});
