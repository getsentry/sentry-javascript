import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should capture a simple error with message', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        exception: {
          values: [
            {
              type: 'Error',
              value: 'test_simple_error',
              mechanism: {
                type: 'generic',
                handled: true,
              },
              stacktrace: {
                frames: expect.any(Array),
              },
            },
          ],
        },
      },
    })
    .start(done);
});
