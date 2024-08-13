import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('mysql auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should auto-instrument `genericPool` package when using pool.require()', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          // op: 'transaction',
          data: expect.objectContaining({
            description: 'generic-pool.aquire',
            origin: 'manual',
          }),
        }),
      ]),
    };

    createRunner(__dirname, 'scenario.js').expect({ transaction: EXPECTED_TRANSACTION }).start(done);
  });
});
