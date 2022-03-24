const transaction = Sentry.startTransaction({ name: 'test_transaction_1' });
transaction.finish();
