import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('dataloader auto-instrumentation', () => {
  afterAll(async () => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION = {
    transaction: 'GET /',
    spans: expect.arrayContaining([
      expect.objectContaining({
        data: expect.objectContaining({
          'sentry.origin': 'auto.db.otel.dataloader',
          'sentry.op': 'cache.get',
        }),
        description: 'dataloader.load',
        origin: 'auto.db.otel.dataloader',
        op: 'cache.get',
        status: 'ok',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'sentry.origin': 'auto.db.otel.dataloader',
          'sentry.op': 'cache.get',
        }),
        description: 'dataloader.batch',
        origin: 'auto.db.otel.dataloader',
        op: 'cache.get',
        status: 'ok',
      }),
    ]),
  };

  test('should auto-instrument `dataloader` package.', done => {
    createRunner(__dirname, 'scenario.js')
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start(done)
      .makeRequest('get', '/');
  });
});
