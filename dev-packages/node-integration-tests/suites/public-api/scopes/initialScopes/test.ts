import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should apply scopes correctly', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'outer_before',
        extra: {
          aa: 'aa',
          bb: 'bb',
        },
      },
    })
    .expect({
      event: {
        message: 'inner',
        extra: {
          aa: 'aa',
          bb: 'bb',
          cc: 'cc',
        },
      },
    })
    .expect({
      event: {
        message: 'outer_after',
        extra: {
          aa: 'aa',
          bb: 'bb',
        },
      },
    })
    .start(done);
});
