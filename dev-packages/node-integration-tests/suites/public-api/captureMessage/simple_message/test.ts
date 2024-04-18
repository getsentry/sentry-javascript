import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should capture a simple message string', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'Message',
        level: 'info',
      },
    })
    .start(done);
});
