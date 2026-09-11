import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createCjsTests } from '../../../utils/runner';

describe('express span isolationScope', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('correctly applies isolation scope to span', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            const serverSpan = container.items.find(item => item.is_segment);

            expect(serverSpan).toMatchObject({
              name: 'GET /test/isolationScope',
              attributes: expect.objectContaining({
                global: { type: 'string', value: 'attribute' },
                'isolation-scope': { type: 'string', value: 'attribute' },
                'user.id': { type: 'string', value: 'user-1' },
              }),
            });
          },
        })
        .start();
      runner.makeRequest('get', '/test/isolationScope');
      await runner.completed();
    });
  });
});
