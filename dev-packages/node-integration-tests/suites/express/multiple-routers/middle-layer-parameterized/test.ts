import { conditionalTest } from '../../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

// Before Node 16, parametrization is not working properly here
conditionalTest({ min: 16 })('middle-layer-parameterized', () => {
  test('should construct correct url with multiple parameterized routers, when param is also contain in middle layer route', done => {
    // parse node.js major version
    const [major] = process.versions.node.split('.').map(Number);
    // Split test result base on major node version because regex d flag is support from node 16+
    const EXPECTED_TRANSACTION =
      major >= 16
        ? {
            transaction: 'GET /api/v1/users/:userId/posts/:postId',
            transaction_info: {
              source: 'route',
            },
          }
        : {
            transaction: 'GET /api/v1/users/123/posts/:postId',
            transaction_info: {
              source: 'route',
            },
          };

    createRunner(__dirname, 'server.ts')
      .ignore('event', 'session', 'sessions')
      .expect({ transaction: EXPECTED_TRANSACTION as any })
      .start(done)
      .makeRequest('get', '/api/v1/users/123/posts/456');
  });
});
