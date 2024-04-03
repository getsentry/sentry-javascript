import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should set a simple context', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'simple_context_object',
        contexts: {
          foo: {
            bar: 'baz',
          },
        },
      },
    })
    .start(done);
});
