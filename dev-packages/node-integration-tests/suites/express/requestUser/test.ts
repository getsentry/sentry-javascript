import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('express user handling', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('picks user from request', done => {
    createRunner(__dirname, 'server.js')
      .expect({
        event: {
          user: {
            id: '1',
            email: 'test@sentry.io',
          },
          exception: {
            values: [
              {
                value: 'error_1',
              },
            ],
          },
        },
      })
      .start(done)
      .makeRequest('get', '/test1', { expectError: true });
  });

  test('setUser overwrites user from request', done => {
    createRunner(__dirname, 'server.js')
      .expect({
        event: {
          user: {
            id: '2',
            email: 'test2@sentry.io',
          },
          exception: {
            values: [
              {
                value: 'error_2',
              },
            ],
          },
        },
      })
      .start(done)
      .makeRequest('get', '/test2', { expectError: true });
  });
});
