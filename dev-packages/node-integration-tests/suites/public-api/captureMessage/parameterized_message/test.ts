import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should capture a parameterized representation of the message', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        logentry: {
          message: 'This is a log statement with %s and %s params',
          params: ['first', 'second'],
        },
      },
    })
    .start(done);
});
