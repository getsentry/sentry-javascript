import { PrismaPg } from '@prisma/adapter-pg';
import * as Sentry from '@sentry/node';
import { randomBytes } from 'crypto';
import { PrismaClient } from './prisma/generated/prisma/client.js';

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

const connectionString = 'postgresql://prisma:prisma@localhost:5435/tests';

async function run() {
  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async span => {
      const adapter = new PrismaPg({ connectionString });
      const client = new PrismaClient({ adapter });

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
