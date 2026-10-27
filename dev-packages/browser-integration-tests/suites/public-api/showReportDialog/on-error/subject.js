Sentry.showReportDialog({
  eventId: 'test_id',
  onError: error => {
    window._reportDialogError = error.message;
  },
});
