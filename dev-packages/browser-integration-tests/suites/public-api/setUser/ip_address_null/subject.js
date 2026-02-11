Sentry.setUser({
  id: 'foo',
  ip_address: null,
});

Sentry.captureMessage('first_user');
