import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should add an empty breadcrumb, when an empty object is given', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'test-empty-obj',
      },
    })
    .start(done);
});
