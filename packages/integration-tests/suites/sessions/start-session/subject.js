document.getElementById('start-session').addEventListener('click', () => {
  Sentry.getCurrentHub().startSession();
});

document.getElementById('start-session-with-context').addEventListener('click', () => {
  Sentry.getCurrentHub().startSession({
    sid: 'test_sid',
    init: false,
    status: 'custom',
  });
});
