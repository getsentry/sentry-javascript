import { test } from 'vitest';
import { createRunner } from '../../../../utils/runner';

test('should add a simple breadcrumb', async ({ signal }) => {
  await createRunner({ signal }, __dirname, 'scenario.ts')
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
