import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should set primitive tags', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        message: 'primitive_tags',
        tags: {
          tag_1: 'foo',
          tag_2: 3.141592653589793,
          tag_3: false,
          tag_4: null,
          tag_6: -1,
        },
      },
    })
    .start(done);
});
