import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('genericPool auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should auto-instrument `genericPool` package when calling pool.require()', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          description: expect.stringMatching(/^generic-pool\.ac?quire/),
          origin: 'auto.db.otel.generic_pool',
          data: {
            'sentry.origin': 'auto.db.otel.generic_pool',
          },
          status: 'ok',
        }),

        expect.objectContaining({
          description: expect.stringMatching(/^generic-pool\.ac?quire/),
          origin: 'auto.db.otel.generic_pool',
          data: {
            'sentry.origin': 'auto.db.otel.generic_pool',
          },
          status: 'ok',
        }),
      ]),
    };

    createRunner(__dirname, 'scenario.js').expect({ transaction: EXPECTED_TRANSACTION }).start(done);
  });
});
