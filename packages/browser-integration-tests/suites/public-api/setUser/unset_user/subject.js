Sentry.captureMessage('no_user');

Sentry.setUser({
  id: 'foo',
  ip_address: 'bar',
  other_key: 'baz',
});

Sentry.captureMessage('user');

Sentry.setUser(null);

Sentry.captureMessage('unset_user');
