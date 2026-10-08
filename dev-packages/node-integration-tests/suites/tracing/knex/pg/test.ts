import {
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_QUERY_SUMMARY,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { describe, expect } from 'vitest';
import { createEsmAndCjsTests, describeWithDockerCompose } from '../../../../utils/runner';

describe('knex auto instrumentation', () => {
  // Update this if another knex version is installed
  const KNEX_VERSION = '2.5.1';
  const ORIGIN = 'auto.db.knex';

  describeWithDockerCompose('with `pg` client', { workingDirectory: [__dirname] }, () => {
    createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
      test('should auto-instrument `knex` package', { timeout: 60_000 }, async () => {
        const EXPECTED_SPANS = [
          expect.objectContaining({
            attributes: expect.objectContaining({
              'knex.version': { type: 'string', value: KNEX_VERSION },
              [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
              [DB_NAMESPACE]: { type: 'string', value: 'tests' },
              [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
              [SENTRY_OP]: { type: 'string', value: 'db' },
              [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
              [SERVER_PORT]: { type: 'integer', value: 5445 },
              [DB_QUERY_TEXT]: {
                type: 'string',
                value:
                  'create table "User" ("id" serial primary key, "createdAt" timestamptz(?) not null default CURRENT_TIMESTAMP(?), "email" text not null, "name" text not null)',
              },
              [DB_QUERY_SUMMARY]: { type: 'string', value: 'create table "User"' },
            }),
            status: 'ok',
            name: 'create table "User"',
          }),
          expect.objectContaining({
            attributes: expect.objectContaining({
              'knex.version': { type: 'string', value: KNEX_VERSION },
              [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
              [DB_NAMESPACE]: { type: 'string', value: 'tests' },
              [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
              [SENTRY_OP]: { type: 'string', value: 'db' },
              [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
              [SERVER_PORT]: { type: 'integer', value: 5445 },
              [DB_QUERY_TEXT]: { type: 'string', value: 'insert into "User" ("email", "name") values (?, ?)' },
              [DB_QUERY_SUMMARY]: { type: 'string', value: 'insert "User"' },
            }),
            status: 'ok',
            // In the knex-otel spans, the placeholders (e.g., `$1`) are replaced by a `?`.
            name: 'insert "User"',
          }),

          expect.objectContaining({
            attributes: expect.objectContaining({
              'knex.version': { type: 'string', value: KNEX_VERSION },
              [DB_OPERATION_NAME]: { type: 'string', value: 'select' },
              'db.sql.table': { type: 'string', value: 'User' },
              [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
              [DB_NAMESPACE]: { type: 'string', value: 'tests' },
              [DB_QUERY_TEXT]: { type: 'string', value: 'select * from "User"' },
              [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
              [SENTRY_OP]: { type: 'string', value: 'db' },
              [DB_QUERY_SUMMARY]: { type: 'string', value: 'select "User"' },
            }),
            status: 'ok',
            name: 'select "User"',
          }),

          expect.objectContaining({
            attributes: expect.objectContaining({
              'knex.version': { type: 'string', value: KNEX_VERSION },
              [DB_OPERATION_NAME]: { type: 'string', value: 'select' },
              'db.sql.table': { type: 'string', value: 'DoesNotExist' },
              [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
              [DB_NAMESPACE]: { type: 'string', value: 'tests' },
              [DB_QUERY_TEXT]: { type: 'string', value: 'select * from "DoesNotExist"' },
              [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
              [SENTRY_OP]: { type: 'string', value: 'db' },
              [DB_QUERY_SUMMARY]: { type: 'string', value: 'select "DoesNotExist"' },
            }),
            status: 'error',
            name: 'select "DoesNotExist"',
          }),
          expect.objectContaining({
            attributes: expect.objectContaining({
              [DB_QUERY_TEXT]: { type: 'string', value: 'drop table "User"' },
              [DB_QUERY_SUMMARY]: { type: 'string', value: 'drop table "User"' },
            }),
            name: 'drop table "User"',
          }),
        ];

        await createRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment)?.name).toBe('Test Transaction');
              const knexSpans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === ORIGIN);
              expect(knexSpans).toEqual(EXPECTED_SPANS);
            },
          })
          .start()
          .completed();
      });
    });
  });
});
