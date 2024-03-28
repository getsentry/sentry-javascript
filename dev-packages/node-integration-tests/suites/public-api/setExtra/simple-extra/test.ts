import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should set a simple extra', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'simple_extra',
        extra: {
          foo: {
            foo: 'bar',
            baz: {
              qux: 'quux',
            },
          },
        },
      },
    })
    .start(done);
});
