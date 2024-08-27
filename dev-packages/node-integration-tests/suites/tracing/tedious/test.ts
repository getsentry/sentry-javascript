import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

jest.setTimeout(75000);

describe('tedious auto instrumentation', () => {
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
