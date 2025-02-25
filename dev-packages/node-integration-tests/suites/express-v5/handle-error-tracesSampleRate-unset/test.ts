import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should capture and send Express controller error if tracesSampleRate is not set.', async () => {
  const runner = createRunner(__dirname, 'server.ts')
    .ignore('transaction')
    .expect({
      event: {
        exception: {
          values: [
            {
              mechanism: {
                type: 'middleware',
                handled: false,
              },
              type: 'Error',
              value: 'test_error with id 123',
              stacktrace: {
                frames: expect.arrayContaining([
                  expect.objectContaining({
                    function: expect.any(String),
                    lineno: expect.any(Number),
                    colno: expect.any(Number),
                  }),
                ]),
              },
            },
          ],
        },
      },
    })
    .start();
  runner.makeRequest('get', '/test/express/123', { expectError: true });
  await runner.completed();
});
