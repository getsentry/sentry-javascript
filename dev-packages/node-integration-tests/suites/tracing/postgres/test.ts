import { describe, expect, test, vi } from 'vitest';
import { createRunner } from '../../../utils/runner';

// When running docker compose, we need a larger timeout, as this takes some time...
vi.setConfig({ testTimeout: 575 });

describe('postgres auto instrumentation', () => {
  test('should auto-instrument `pg` package', async () => {
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
      .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['port 5432'] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });
});
