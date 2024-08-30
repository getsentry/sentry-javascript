import { createRunner } from '../../../utils/runner';

jest.setTimeout(75000);

describe('knex auto instrumentation', () => {
  test('should auto-instrument `knex` package', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'knex',
            'db.name': 'tests',
            'db.statement':
              'create table "User" ("id" serial primary key, "createdAt" timestamptz(3) not null default CURRENT_TIMESTAMP(3), "email" text not null, "name" text not null)',
            'sentry.origin': 'auto.db.otel.knex',
            'sentry.op': 'db',
            'net.peer.name': 'localhost',
            'net.peer.port': 5445,
          }),
          status: 'ok',
          description:
            'create table "User" ("id" serial primary key, "createdAt" timestamptz(3) not null default CURRENT_TIMESTAMP(3), "email" text not null, "name" text not null)',
          origin: 'auto.db.otel.knex',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'knex',
            'db.name': 'tests',
            'db.statement': 'insert into "User" ("email", "name") values (?, ?)',
            'sentry.origin': 'auto.db.otel.knex',
            'sentry.op': 'db',
            'net.peer.name': 'localhost',
            'net.peer.port': 5445,
          }),
          status: 'ok',
          // In the otel spans, the placeholders (e.g., `$1`) are replaced by a `?`.
          description: 'insert into "User" ("email", "name") values (?, ?)',
          origin: 'auto.db.otel.knex',
        }),

        expect.objectContaining({
          data: expect.objectContaining({
            'db.operation': 'select',
            'db.sql.table': 'User',
            'db.system': 'knex',
            'db.name': 'tests',
            'db.statement': 'select * from "User"',
            'sentry.origin': 'auto.db.otel.knex',
            'sentry.op': 'db',
          }),
          status: 'ok',
          description: 'select * from "User"',
          origin: 'auto.db.otel.knex',
        }),
      ]),
    };

    createRunner(__dirname, 'scenario.js')
      .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['port 5432'] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start(done);
  });
});
