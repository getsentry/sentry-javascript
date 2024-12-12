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
          dd: 'dd',
          ee: 'ee',
        },
      },
    })
    .expect({
      event: {
        message: 'inner_async_context',
        extra: {
          aa: 'aa',
          bb: 'bb',
          cc: 'cc',
          dd: 'dd',
          ff: 'ff',
          gg: 'gg',
        },
      },
    })
    .expect({
      event: {
        message: 'outer_after',
        extra: {
          aa: 'aa',
          bb: 'bb',
          cc: 'cc',
          dd: 'dd',
        },
      },
    })
    .start(done);
});
