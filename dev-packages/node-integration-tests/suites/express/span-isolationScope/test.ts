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
          transaction: {
            transaction: 'GET /test/isolationScope',
            breadcrumbs: [
              {
                category: 'console',
                level: 'log',
                message: expect.stringMatching(/\{"port":(\d+)\}/),
                timestamp: expect.any(Number),
              },
              {
                category: 'console',
                level: 'log',
                message: 'This is a test log.',
                timestamp: expect.any(Number),
              },
              {
                message: 'manual breadcrumb',
                timestamp: expect.any(Number),
              },
            ],
            tags: {
              global: 'tag',
              'isolation-scope': 'tag',
            },
          },
        })
        .start();
      runner.makeRequest('get', '/test/isolationScope');
      await runner.completed();
    });
  });
});
