import { describe, expect } from 'vitest';
import { isOrchestrionEnabled } from '../../../../utils';
import { createEsmAndCjsTests, describeWithDockerCompose } from '../../../../utils/runner';

describeWithDockerCompose('knex auto instrumentation', { workingDirectory: [__dirname] }, () => {
  // Update this if another knex version is installed
  const KNEX_VERSION = '2.5.1';
  const ORIGIN = isOrchestrionEnabled() ? 'auto.db.knex' : 'auto.db.otel.knex';

  describe('with `mysql2` client', () => {
    createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
      test('should auto-instrument `knex` package', { timeout: 60_000 }, async () => {
        const EXPECTED_TRANSACTION = {
          transaction: 'Test Transaction',
          spans: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                'knex.version': KNEX_VERSION,
                'db.system': 'mysql2',
                'db.name': 'tests',
                'db.user': 'root',
                'sentry.origin': ORIGIN,
                'sentry.op': 'db',
                'net.peer.name': 'localhost',
                'net.peer.port': 3307,
              }),
              status: 'ok',
              description:
                'create table `User` (`id` int unsigned not null auto_increment primary key, `createdAt` timestamp(3) not null default CURRENT_TIMESTAMP(3), `email` text not null, `name` text not null)',
              origin: ORIGIN,
            }),
            expect.objectContaining({
              data: expect.objectContaining({
                'knex.version': KNEX_VERSION,
                'db.system': 'mysql2',
                'db.name': 'tests',
                'db.user': 'root',
                'sentry.origin': ORIGIN,
                'sentry.op': 'db',
                'net.peer.name': 'localhost',
                'net.peer.port': 3307,
              }),
              status: 'ok',
              description: 'insert into `User` (`email`, `name`) values (?, ?)',
              origin: ORIGIN,
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
                'sentry.origin': ORIGIN,
                'sentry.op': 'db',
              }),
              status: 'ok',
              description: 'select * from `User`',
              origin: ORIGIN,
            }),
          ]),
        };

        await createRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
      });
    });
  });
});
