document.getElementById('start-transaction').addEventListener('click', () => {
  window.transaction = Sentry.startTransaction({ name: 'test-transaction' });
  Sentry.getCurrentHub().configureScope(scope => scope.setSpan(window.transaction));
});
