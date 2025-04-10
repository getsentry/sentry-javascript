setTimeout(() => {
  Sentry.withScope(scope => {
    scope.setTag('to', 'a');
    Sentry.captureException(new Error('Error a'));
  });
  Sentry.withScope(scope => {
    scope.setTag('to', 'b');
    Sentry.captureException(new Error('Error b'));
  });
}, 0);
