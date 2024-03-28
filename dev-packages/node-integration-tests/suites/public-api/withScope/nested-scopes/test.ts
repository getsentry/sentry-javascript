import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should allow nested scoping', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'root_before',
        user: {
          id: 'qux',
        },
      },
    })
    .expect({
      event: {
        message: 'outer_before',
        user: {
          id: 'qux',
        },
        tags: {
          foo: false,
        },
      },
    })
    .expect({
      event: {
        message: 'inner',
        tags: {
          foo: false,
          bar: 10,
        },
      },
    })
    .expect({
      event: {
        message: 'outer_after',
        user: {
          id: 'baz',
        },
        tags: {
          foo: false,
        },
      },
    })
    .expect({
      event: {
        message: 'root_after',
        user: {
          id: 'qux',
        },
      },
    })
    .start(done);
});
