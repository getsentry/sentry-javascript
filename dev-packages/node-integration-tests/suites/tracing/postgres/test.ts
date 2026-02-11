import { describe, expect, test } from 'vitest';
import { createRunner } from '../../../utils/runner';

describe('postgres auto instrumentation', () => {
  test('should auto-instrument `pg` package', { timeout: 90_000 }, async () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'sentry.origin': 'manual',
            'sentry.op': 'db',
          }),
          description: 'pg.connect',
          op: 'db',
          status: 'ok',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'db.statement': 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)',
            'sentry.origin': 'auto.db.otel.postgres',
            'sentry.op': 'db',
          }),
          description: 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'db.statement': 'SELECT * FROM "User"',
            'sentry.origin': 'auto.db.otel.postgres',
            'sentry.op': 'db',
          }),
          description: 'SELECT * FROM "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
        }),
      ]),
    };

    await createRunner(__dirname, 'scenario.js')
      .withDockerCompose({
        workingDirectory: [__dirname],
        readyMatches: ['port 5432'],
        setupCommand: 'yarn',
      })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });

  test('should auto-instrument `pg-native` package', { timeout: 90_000 }, async () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'sentry.origin': 'manual',
            'sentry.op': 'db',
          }),
          description: 'pg.connect',
          op: 'db',
          status: 'ok',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'db.statement': 'INSERT INTO "NativeUser" ("email", "name") VALUES ($1, $2)',
            'sentry.origin': 'auto.db.otel.postgres',
            'sentry.op': 'db',
          }),
          description: 'INSERT INTO "NativeUser" ("email", "name") VALUES ($1, $2)',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'db.statement': 'SELECT * FROM "NativeUser"',
            'sentry.origin': 'auto.db.otel.postgres',
            'sentry.op': 'db',
          }),
          description: 'SELECT * FROM "NativeUser"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
        }),
      ]),
    };

    await createRunner(__dirname, 'scenario-native.js')
      .withDockerCompose({
        workingDirectory: [__dirname],
        readyMatches: ['port 5432'],
        setupCommand: 'yarn',
      })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });
});
