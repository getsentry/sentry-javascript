import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('mysql2 auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should auto-instrument `mysql` package without connection.connect()', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          description: 'SELECT 1 + 1 AS solution',
          op: 'db',
          data: expect.objectContaining({
            'db.system': 'mysql',
            'net.peer.name': 'localhost',
            'net.peer.port': 3306,
            'db.user': 'root',
          }),
        }),
        expect.objectContaining({
          description: 'SELECT NOW()',
          op: 'db',
          data: expect.objectContaining({
            'db.system': 'mysql',
            'net.peer.name': 'localhost',
            'net.peer.port': 3306,
            'db.user': 'root',
          }),
        }),
      ]),
    };

    createRunner(__dirname, 'scenario.js')
      .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['port: 3306'] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start(done);
  });
});
