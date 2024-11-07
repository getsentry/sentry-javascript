import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

jest.setTimeout(75000);

// Tedious version we are testing against only supports Node 18+
// https://github.com/tediousjs/tedious/blob/8310c455a2cc1cba83c1ca3c16677da4f83e12a9/package.json#L38
conditionalTest({ min: 18 })('tedious auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should auto-instrument `tedious` package', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          description: 'SELECT GETDATE()',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.tedious',
            'sentry.op': 'db',
            'db.name': 'master',
            'db.statement': 'SELECT GETDATE()',
            'db.system': 'mssql',
            'db.user': 'sa',
            'net.peer.name': '127.0.0.1',
            'net.peer.port': 1433,
          }),
          status: 'ok',
        }),
        expect.objectContaining({
          description: 'SELECT 1 + 1 AS solution',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.tedious',
            'sentry.op': 'db',
            'db.name': 'master',
            'db.statement': 'SELECT 1 + 1 AS solution',
            'db.system': 'mssql',
            'db.user': 'sa',
            'net.peer.name': '127.0.0.1',
            'net.peer.port': 1433,
          }),
          status: 'ok',
        }),
      ]),
    };

    createRunner(__dirname, 'scenario.js')
      .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['1433'] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start(done);
  });
});
