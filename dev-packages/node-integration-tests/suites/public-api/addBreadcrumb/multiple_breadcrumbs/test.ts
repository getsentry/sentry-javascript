import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should add multiple breadcrumbs', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'test_multi_breadcrumbs',
        breadcrumbs: [
          {
            category: 'foo',
            message: 'bar',
            level: 'fatal',
          },
          {
            category: 'qux',
          },
        ],
      },
    })
    .start(done);
});
