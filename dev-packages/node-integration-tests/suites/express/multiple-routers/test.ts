import { afterAll, describe } from 'vitest';
import { cleanupChildProcesses, createCjsTests } from '../../../utils/runner';

describe('express multiple routers', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createCjsTests(__dirname, 'scenario-common-infix.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should construct correct url with common infixes with multiple routers.', async () => {
      const runner = createRunner()
        .ignore('transaction')
        .expect({ event: { message: 'Custom Message', transaction: 'GET /api2/v1/test' } })
        .start();
      runner.makeRequest('get', '/api2/v1/test');
      await runner.completed();
    });
  });

  createCjsTests(__dirname, 'scenario-common-infix-parameterized.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should construct correct url with common infixes with multiple parameterized routers.', async () => {
      const runner = createRunner()
        .ignore('transaction')
        .expect({ event: { message: 'Custom Message', transaction: 'GET /api/v1/user/:userId' } })
        .start();
      runner.makeRequest('get', '/api/v1/user/3212');
      await runner.completed();
    });
  });

  createCjsTests(__dirname, 'scenario-common-prefix.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should construct correct urls with multiple routers.', async () => {
      const runner = createRunner()
        .ignore('transaction')
        .expect({ event: { message: 'Custom Message', transaction: 'GET /api/v1/test' } })
        .start();
      runner.makeRequest('get', '/api/v1/test');
      await runner.completed();
    });

    test('should construct correct urls with multiple parameterized routers.', async () => {
      const runner = createRunner()
        .ignore('transaction')
        .expect({ event: { message: 'Custom Message', transaction: 'GET /api/v1/user/:userId' } })
        .start();
      runner.makeRequest('get', '/api/v1/user/1234/');
      await runner.completed();
    });
  });

  createCjsTests(__dirname, 'scenario-common-prefix-reverse.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should construct correct urls with multiple parameterized routers (use order reversed).', async () => {
      const runner = createRunner()
        .ignore('transaction')
        .expect({ event: { message: 'Custom Message', transaction: 'GET /api/v1/user/:userId' } })
        .start();
      runner.makeRequest('get', '/api/v1/user/1234/');
      await runner.completed();
    });
  });

  createCjsTests(__dirname, 'scenario-common-prefix-same-length.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should construct correct url with multiple parameterized routers of the same length.', async () => {
      const runner = createRunner()
        .ignore('transaction')
        .expect({ event: { message: 'Custom Message', transaction: 'GET /api/v1/:userId' } })
        .start();
      runner.makeRequest('get', '/api/v1/1234/');
      await runner.completed();
    });
  });

  describe('complex-router', () => {
    createCjsTests(__dirname, 'scenario-complex-router.mjs', 'instrument.mjs', (createRunner, test) => {
      test('should construct correct url with multiple parameterized routers, when param is also contain in middle layer route and express used multiple middlewares with route', async () => {
        const runner = createRunner()
          .ignore('event')
          .expect({
            transaction: {
              transaction: 'GET /api/api/v1/sub-router/users/:userId/posts/:postId',
              transaction_info: {
                source: 'route',
              },
            },
          })
          .start();
        runner.makeRequest('get', '/api/api/v1/sub-router/users/123/posts/456');
        await runner.completed();
      });

      test('should construct correct url with multiple parameterized routers, when param is also contain in middle layer route and express used multiple middlewares with route and original url has query params', async () => {
        const runner = createRunner()
          .ignore('event')
          .expect({
            transaction: {
              transaction: 'GET /api/api/v1/sub-router/users/:userId/posts/:postId',
              transaction_info: {
                source: 'route',
              },
            },
          })
          .start();
        runner.makeRequest('get', '/api/api/v1/sub-router/users/123/posts/456?param=1');
        await runner.completed();
      });

      test('should construct correct url with multiple parameterized routers, when param is also contain in middle layer route and express used multiple middlewares with route and original url ends with trailing slash and has query params', async () => {
        const runner = createRunner()
          .ignore('event')
          .expect({
            transaction: {
              transaction: 'GET /api/api/v1/sub-router/users/:userId/posts/:postId',
              transaction_info: {
                source: 'route',
              },
            },
          })
          .start();
        runner.makeRequest('get', '/api/api/v1/sub-router/users/123/posts/456/?param=1');
        await runner.completed();
      });
    });
  });

  // Before Node 16, parametrization is not working properly here
  describe('middle-layer-parameterized', () => {
    createCjsTests(__dirname, 'scenario-middle-layer.mjs', 'instrument.mjs', (createRunner, test) => {
      test('should construct correct url with multiple parameterized routers, when param is also contain in middle layer route', async () => {
        const runner = createRunner()
          .ignore('event')
          .expect({
            transaction: {
              transaction: 'GET /api/v1/users/:userId/posts/:postId',
              transaction_info: {
                source: 'route',
              },
            },
          })
          .start();
        runner.makeRequest('get', '/api/v1/users/123/posts/456');
        await runner.completed();
      });
    });
  });
});
