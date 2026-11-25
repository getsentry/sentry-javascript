try {
  Sentry.showReportDialog({
    eventId: 'test_id',
    onError: error => {
      window._reportDialogError = error.message;
    },
  });
} catch (error) {
  window._thrownError = error.message;
}
window._subjectDone = true;
