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

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.startSpanManual(
  {
    name: 'Test Span',
  },
  async span => {
    try {
      await client.user.create({
        data: {
          name: 'Dog',
          email: 'dog@sentry.io',
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
      if (span) span.end();
    }
  },
);
