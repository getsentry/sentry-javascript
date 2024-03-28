import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should normalize non-serializable extra', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'non_serializable',
        extra: {},
      },
    })
    .start(done);
});
