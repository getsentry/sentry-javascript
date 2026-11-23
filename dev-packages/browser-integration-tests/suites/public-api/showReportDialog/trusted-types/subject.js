window._violations = [];
document.addEventListener('securitypolicyviolation', event => {
  window._violations.push(`${event.violatedDirective}: ${event.sample}`);
});

window._reportDialogLoaded = false;
Sentry.showReportDialog({
  eventId: 'test_id',
  onLoad: () => {
    window._reportDialogLoaded = true;
  },
});
