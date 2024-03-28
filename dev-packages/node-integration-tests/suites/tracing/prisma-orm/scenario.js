const { randomBytes } = require('crypto');
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
const { PrismaClient } = require('@prisma/client');
const Sentry = require('@sentry/node');
const { loggingTransport } = require('@sentry-internal/node-integration-tests');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [Sentry.prismaIntegration()],
});

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

async function run() {
  const client = new PrismaClient();

  await Sentry.startSpan(
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

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
