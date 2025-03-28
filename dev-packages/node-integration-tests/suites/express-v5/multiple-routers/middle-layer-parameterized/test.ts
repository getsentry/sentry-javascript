import { afterAll, describe, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

// Before Node 16, parametrization is not working properly here
describe('middle-layer-parameterized', () => {
  test('should construct correct url with multiple parameterized routers, when param is also contain in middle layer route', async () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'GET /api/v1/users/:userId/posts/:postId',
      transaction_info: {
        source: 'route',
      },
    };

    const runner = createRunner(__dirname, 'server.ts')
      .ignore('event')
      .expect({ transaction: EXPECTED_TRANSACTION as any })
      .start();
    runner.makeRequest('get', '/api/v1/users/123/posts/456');
    await runner.completed();
  });
});
