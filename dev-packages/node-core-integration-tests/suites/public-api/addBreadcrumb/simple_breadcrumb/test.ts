import { test } from 'vitest';
import { createRunner } from '../../../../utils/runner';

test('should add a simple breadcrumb', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'test_simple',
        breadcrumbs: [
          {
            category: 'foo',
            message: 'bar',
            level: 'fatal',
          },
        ],
      },
    })
    .start()
    .completed();
});
