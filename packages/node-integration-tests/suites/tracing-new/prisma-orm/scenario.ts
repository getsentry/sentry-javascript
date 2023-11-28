import { randomBytes } from 'crypto';
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { PrismaClient } from '@prisma/client';
import * as Sentry from '@sentry/node';

const client = new PrismaClient();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [new Sentry.Integrations.Prisma({ client })],
});

async function run(): Promise<void> {
  const transaction = Sentry.startTransaction({
    name: 'Test Transaction',
    op: 'transaction',
  });

  Sentry.configureScope(scope => {
    scope.setSpan(transaction);
  });

  try {
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
  } finally {
    if (transaction) transaction.finish();
  }
}

void run();
