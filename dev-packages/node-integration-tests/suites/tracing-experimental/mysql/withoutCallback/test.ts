import { createRunner } from '../../../../utils/runner';

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

test('should auto-instrument `mysql` package when using query without callback', done => {
  createRunner(__dirname, 'scenario.js').expect({ transaction: EXPECTED_TRANSACTION }).start(done);
});
