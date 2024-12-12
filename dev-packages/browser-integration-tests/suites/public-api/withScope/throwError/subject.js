Sentry.setTag('global', 'tag');
setTimeout(() => {
  Sentry.withScope(scope => {
    scope.setTag('local', 'tag');
    throw new Error('test error');
  });
}, 10);
