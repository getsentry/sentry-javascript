import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

// Before Node 16, parametrization is not working properly here
describe('middle-layer-parameterized', () => {
  test('should construct correct url with multiple parameterized routers, when param is also contain in middle layer route', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'GET /api/v1/users/:userId/posts/:postId',
      transaction_info: {
        source: 'route',
      },
    };

    createRunner(__dirname, 'server.ts')
      .ignore('event')
      .expect({ transaction: EXPECTED_TRANSACTION as any })
      .start(done)
      .makeRequest('get', '/api/v1/users/123/posts/456');
  });
});
