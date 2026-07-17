document.getElementById('disable-session-tracking').addEventListener('click', () => {
  Sentry.getClient().setSessionTrackingEnabled(false);
});

document.getElementById('click-me').addEventListener('click', () => {
  // Produces a Replay breadcrumb event, triggering a flush
  console.log('clicked');
});
