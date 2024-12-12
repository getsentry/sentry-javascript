import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should record multiple extras of different types', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'multiple_extras',
        extra: {
          extra_1: { foo: 'bar', baz: { qux: 'quux' } },
          extra_2: false,
        },
      },
    })
    .start(done);
});
