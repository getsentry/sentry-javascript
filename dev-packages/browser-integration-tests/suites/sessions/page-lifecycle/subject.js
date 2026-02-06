let clickCount = 0;

document.getElementById('navigate').addEventListener('click', () => {
  clickCount++;
  // Each click navigates to a different page
  history.pushState({}, '', `/page-${clickCount}`);
});

document.getElementById('manual-session').addEventListener('click', () => {
  Sentry.startSession();
  Sentry.captureException('Test error from manual session');
});
