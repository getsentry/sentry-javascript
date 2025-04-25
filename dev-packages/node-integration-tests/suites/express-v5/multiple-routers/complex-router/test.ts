import { afterAll, describe, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

describe('complex-router', () => {
  test('should construct correct url with multiple parameterized routers, when param is also contain in middle layer route and express used multiple middlewares with route', async () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'GET /api/api/v1/sub-router/users/:userId/posts/:postId',
      transaction_info: {
        source: 'route',
      },
    };

    const runner = createRunner(__dirname, 'server.ts')
      .ignore('event')
      .expect({ transaction: EXPECTED_TRANSACTION as any })
      .start();
    runner.makeRequest('get', '/api/api/v1/sub-router/users/123/posts/456');
    await runner.completed();
  });

  test('should construct correct url with multiple parameterized routers, when param is also contain in middle layer route and express used multiple middlewares with route and original url has query params', async () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'GET /api/api/v1/sub-router/users/:userId/posts/:postId',
      transaction_info: {
        source: 'route',
      },
    };

    const runner = createRunner(__dirname, 'server.ts')
      .ignore('event')
      .expect({ transaction: EXPECTED_TRANSACTION as any })
      .start();
    runner.makeRequest('get', '/api/api/v1/sub-router/users/123/posts/456?param=1');
    await runner.completed();
  });

  test('should construct correct url with multiple parameterized routers, when param is also contain in middle layer route and express used multiple middlewares with route and original url ends with trailing slash and has query params', async () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'GET /api/api/v1/sub-router/users/:userId/posts/:postId',
      transaction_info: {
        source: 'route',
      },
    };

    const runner = createRunner(__dirname, 'server.ts')
      .ignore('event')
      .expect({ transaction: EXPECTED_TRANSACTION as any })
      .start();
    runner.makeRequest('get', '/api/api/v1/sub-router/users/123/posts/456/?param=1');
    await runner.completed();
  });
});
