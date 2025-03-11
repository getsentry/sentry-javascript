import { describe, expect, test } from 'vitest';
import { createRunner } from '../../../utils/runner';

describe('knex auto instrumentation', () => {
  // Update this if another knex version is installed
  const KNEX_VERSION = '2.5.1';

  test('should auto-instrument `knex` package when using `pg` client', { timeout: 60_000 }, async () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            'knex.version': KNEX_VERSION,
            'db.system': 'postgresql',
            'db.name': 'tests',
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
            'knex.version': KNEX_VERSION,
            'db.system': 'postgresql',
            'db.name': 'tests',
            'sentry.origin': 'auto.db.otel.knex',
            'sentry.op': 'db',
            'net.peer.name': 'localhost',
            'net.peer.port': 5445,
          }),
          status: 'ok',
          // In the knex-otel spans, the placeholders (e.g., `$1`) are replaced by a `?`.
          description: 'insert into "User" ("email", "name") values (?, ?)',
          origin: 'auto.db.otel.knex',
        }),

        expect.objectContaining({
          data: expect.objectContaining({
            'knex.version': KNEX_VERSION,
            'db.operation': 'select',
            'db.sql.table': 'User',
            'db.system': 'postgresql',
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

    await createRunner(__dirname, 'scenario-withPostgres.js')
      .withDockerCompose({ workingDirectory: [__dirname], waitForPorts: [5432] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });

  test('should auto-instrument `knex` package when using `mysql2` client', { timeout: 60_000 }, async () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            'knex.version': KNEX_VERSION,
            'db.system': 'mysql2',
            'db.name': 'tests',
            'db.user': 'root',
            'sentry.origin': 'auto.db.otel.knex',
            'sentry.op': 'db',
            'net.peer.name': 'localhost',
            'net.peer.port': 3307,
          }),
          status: 'ok',
          description:
            'create table `User` (`id` int unsigned not null auto_increment primary key, `createdAt` timestamp(3) not null default CURRENT_TIMESTAMP(3), `email` text not null, `name` text not null)',
          origin: 'auto.db.otel.knex',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'knex.version': KNEX_VERSION,
            'db.system': 'mysql2',
            'db.name': 'tests',
            'db.user': 'root',
            'sentry.origin': 'auto.db.otel.knex',
            'sentry.op': 'db',
            'net.peer.name': 'localhost',
            'net.peer.port': 3307,
          }),
          status: 'ok',
          description: 'insert into `User` (`email`, `name`) values (?, ?)',
          origin: 'auto.db.otel.knex',
        }),

        expect.objectContaining({
          data: expect.objectContaining({
            'knex.version': KNEX_VERSION,
            'db.operation': 'select',
            'db.sql.table': 'User',
            'db.system': 'mysql2',
            'db.name': 'tests',
            'db.statement': 'select * from `User`',
            'db.user': 'root',
            'sentry.origin': 'auto.db.otel.knex',
            'sentry.op': 'db',
          }),
          status: 'ok',
          description: 'select * from `User`',
          origin: 'auto.db.otel.knex',
        }),
      ]),
    };

    await createRunner(__dirname, 'scenario-withMysql2.js')
      .withDockerCompose({ workingDirectory: [__dirname], waitForPorts: [3306] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });
});
