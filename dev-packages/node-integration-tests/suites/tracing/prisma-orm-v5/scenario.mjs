import { PrismaClient } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { randomBytes } from 'crypto';

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

      // Interactive transaction: exercises `prisma:client:transaction` and its nested engine spans.
      await client.$transaction(async tx => {
        await tx.user.create({
          data: {
            name: 'Burt',
            email: `burt_${randomBytes(4).toString('hex')}@sentry.io`,
          },
        });

        await tx.user.findMany();
      });

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
