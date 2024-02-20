/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { PrismaClient } from '@prisma/client';
import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';

const client = new PrismaClient();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  // eslint-disable-next-line deprecation/deprecation
  integrations: [new Tracing.Integrations.Prisma({ client })],
});

Sentry.startSpanManual(
  {
    name: 'Test Span',
  },
  async span => {
    try {
      await client.user.create({
        data: {
          name: 'David',
          email: 'david_cramer@sentry.io',
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
      span?.end();
    }
  },
);
