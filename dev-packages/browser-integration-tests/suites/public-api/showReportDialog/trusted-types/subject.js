window._reportDialogLoaded = false;
Sentry.showReportDialog({
  eventId: 'test_id',
  onLoad: () => {
    window._reportDialogLoaded = true;
  },
});
