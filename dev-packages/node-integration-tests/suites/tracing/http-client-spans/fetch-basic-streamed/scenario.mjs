import * as Sentry from '@sentry/node';

async function run() {
  await Sentry.startSpan({ name: 'test_transaction' }, async () => {
    await fetch(`${process.env.SERVER_URL}/api/v0`);
  });

  await Sentry.flush();
}

void run();
