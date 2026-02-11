import { PrismaClient } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { randomBytes } from 'crypto';

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

async function run() {
  const client = new PrismaClient();

  await Sentry.startSpanManual(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async span => {
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

      setTimeout(async () => {
        span.end();
        await client.$disconnect();
      }, 500);
    },
  );
}

run();
