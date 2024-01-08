Sentry.captureEvent({
  event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2',
  message: 'someMessage',
  transaction: 'wat',
  type: 'transaction',
});

Sentry.captureException(new Error('test_simple_breadcrumb_error'));
