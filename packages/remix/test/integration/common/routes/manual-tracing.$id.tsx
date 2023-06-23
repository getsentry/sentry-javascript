import * as Sentry from '@sentry/remix';

export default function ManualTracing() {
  const transaction = Sentry.startTransaction({ name: 'test_transaction_1' });
  transaction.finish();
  return <div />;
}
