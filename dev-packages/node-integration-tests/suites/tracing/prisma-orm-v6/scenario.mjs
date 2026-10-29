import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { randomBytes } from 'crypto';

async function run() {
  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async span => {
      const client = new PrismaClient();

      await client.$connect();
      await Sentry.withActiveSpan(null, async () => {
        assert.deepEqual(await client.$queryRawUnsafe('SELECT 1 AS before_parent'), [{ before_parent: 1 }]);
      });

      await client.user.create({
        data: {
          name: 'Tilda',
          email: `tilda_${randomBytes(4).toString('hex')}@sentry.io`,
        },
      });

      await client.user.findMany();

      await client.user.deleteMany({
        where: {
          email: {
            contains: 'sentry.io',
          },
        },
      });

      await Sentry.withActiveSpan(null, async () => {
        assert.deepEqual(await client.$queryRawUnsafe('SELECT 3 AS after_parent'), [{ after_parent: 3 }]);
      });

      setTimeout(async () => {
        span.end();
        await client.$disconnect();
      }, 500);
    },
  );
}

run();
