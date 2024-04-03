import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should capture an empty object', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Object captured as exception with keys: [object has no keys]',
              mechanism: {
                type: 'generic',
                handled: true,
              },
            },
          ],
        },
      },
    })
    .start(done);
});
