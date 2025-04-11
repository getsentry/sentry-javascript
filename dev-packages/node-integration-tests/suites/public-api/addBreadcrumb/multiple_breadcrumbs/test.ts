import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should add multiple breadcrumbs', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'test_multi_breadcrumbs',
        breadcrumbs: [
          {
            category: 'foo',
            message: 'bar',
            level: 'fatal',
          },
          {
            category: 'qux',
          },
        ],
      },
    })
    .start()
    .completed();
});
