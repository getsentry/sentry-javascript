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
          description: 'generic-pool.aquire',
          origin: 'auto.db.otel.generic-pool',
          data: {
            'sentry.origin': 'auto.db.otel.generic-pool',
          },
          status: 'ok',
        }),

        expect.objectContaining({
          description: 'generic-pool.aquire',
          origin: 'auto.db.otel.generic-pool',
          data: {
            'sentry.origin': 'auto.db.otel.generic-pool',
          },
          status: 'ok',
        }),
      ]),
    };

    createRunner(__dirname, 'scenario.js').expect({ transaction: EXPECTED_TRANSACTION }).start(done);
  });
});
