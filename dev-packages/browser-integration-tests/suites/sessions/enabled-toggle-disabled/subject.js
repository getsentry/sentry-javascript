document.getElementById('disable').addEventListener('click', () => {
  Sentry.getClient().setSessionTrackingEnabled(false);
});

document.getElementById('enable').addEventListener('click', () => {
  Sentry.getClient().setSessionTrackingEnabled(true);
});

let clickCount = 0;
document.getElementById('navigate').addEventListener('click', () => {
  clickCount++;
  history.pushState({}, '', `/page-${clickCount}`);
});

document.getElementById('set-user').addEventListener('click', () => {
  Sentry.setUser({ id: '1337' });
});
