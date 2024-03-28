import { createRunner } from '../../../../utils/runner';

test('should add a simple breadcrumb', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'test_simple',
        breadcrumbs: [
          {
            category: 'foo',
            message: 'bar',
            level: 'fatal',
          },
        ],
      },
    })
    .start(done);
});
