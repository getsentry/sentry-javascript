import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('express user handling', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('ignores user from request', done => {
    expect.assertions(2);

    createRunner(__dirname, 'server.js')
      .expect({
        event: event => {
          expect(event.user).toBeUndefined();
          expect(event.exception?.values?.[0]?.value).toBe('error_1');
        },
      })
      .start(done)
      .makeRequest('get', '/test1', { expectError: true });
  });

  test('using setUser in middleware works', done => {
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
