import { describe, expect } from 'vitest';
import { createEsmAndCjsTests, describeWithDockerCompose } from '../../../../utils/runner';

describe('knex auto instrumentation', () => {
  // Update this if another knex version is installed
  const KNEX_VERSION = '2.5.1';
  const ORIGIN = 'auto.db.knex';

  describeWithDockerCompose('with `pg` client', { workingDirectory: [__dirname] }, () => {
    createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
      test('should auto-instrument `knex` package', { timeout: 60_000 }, async () => {
        const EXPECTED_TRANSACTION = {
          transaction: 'Test Transaction',
          spans: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                'knex.version': KNEX_VERSION,
                'db.system.name': 'postgresql',
                'db.namespace': 'tests',
                'sentry.origin': ORIGIN,
                'sentry.op': 'db',
                'server.address': 'localhost',
                'server.port': 5445,
              }),
              status: 'ok',
              description:
                'create table "User" ("id" serial primary key, "createdAt" timestamptz(3) not null default CURRENT_TIMESTAMP(3), "email" text not null, "name" text not null)',
              origin: ORIGIN,
            }),
            expect.objectContaining({
              data: expect.objectContaining({
                'knex.version': KNEX_VERSION,
                'db.system.name': 'postgresql',
                'db.namespace': 'tests',
                'sentry.origin': ORIGIN,
                'sentry.op': 'db',
                'server.address': 'localhost',
                'server.port': 5445,
              }),
              status: 'ok',
              // In the knex-otel spans, the placeholders (e.g., `$1`) are replaced by a `?`.
              description: 'insert into "User" ("email", "name") values (?, ?)',
              origin: ORIGIN,
            }),

            expect.objectContaining({
              data: expect.objectContaining({
                'knex.version': KNEX_VERSION,
                'db.operation.name': 'select',
                'db.sql.table': 'User',
                'db.system.name': 'postgresql',
                'db.namespace': 'tests',
                'db.query.text': 'select * from "User"',
                'sentry.origin': ORIGIN,
                'sentry.op': 'db',
              }),
              status: 'ok',
              description: 'select * from "User"',
              origin: ORIGIN,
            }),

            expect.objectContaining({
              data: expect.objectContaining({
                'knex.version': KNEX_VERSION,
                'db.operation.name': 'select',
                'db.sql.table': 'DoesNotExist',
                'db.system.name': 'postgresql',
                'db.namespace': 'tests',
                'db.query.text': 'select * from "DoesNotExist"',
                'sentry.origin': ORIGIN,
                'sentry.op': 'db',
              }),
              status: 'internal_error',
              description: 'select * from "DoesNotExist"',
              origin: ORIGIN,
            }),
          ]),
        };

        await createRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
      });
    });
  });
});
