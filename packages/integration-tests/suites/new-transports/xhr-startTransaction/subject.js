// deactivate fetch s.t. the SDK falls back to XHR transport
window.fetch = undefined;

const transaction = Sentry.startTransaction({ name: 'test_transaction_1' });
transaction.finish();
