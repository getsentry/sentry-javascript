import * as Sentry from '@sentry/node';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.startSpan({ name: 'test_transaction' }, async () => {
  await fetch(`${process.env.SERVER_URL}/api/v0`, { headers: { 'x-test-header': 'test-value' } });
});
