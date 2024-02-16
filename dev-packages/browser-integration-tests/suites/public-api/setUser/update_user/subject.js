Sentry.setUser({
  id: 'foo',
  ip_address: 'bar',
});

Sentry.captureMessage('first_user');

Sentry.setUser({
  id: 'baz',
});

Sentry.captureMessage('second_user');
