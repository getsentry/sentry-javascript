import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should clear previously set properties of a scope', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'cleared_scope',
      },
    })
    .start(done);
});
