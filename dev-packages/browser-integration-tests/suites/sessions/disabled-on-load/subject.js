document.getElementById('throw-error').addEventListener('click', () => {
  throw new Error('Test error');
});

document.getElementById('enable').addEventListener('click', () => {
  Sentry.getClient().setSessionTrackingEnabled(true);
});

let clickCount = 0;
document.getElementById('navigate').addEventListener('click', () => {
  clickCount++;
  history.pushState({}, '', `/page-${clickCount}`);
});
