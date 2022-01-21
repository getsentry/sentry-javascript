Sentry.showReportDialog({
  eventId: 'test_id',
  user: {
    email: 'foo@bar.sentry.io',
    name: 'test',
  },
  lang: 'en-nz',
  title: 'test_title',
  subtitle: 'test_subtitle',
  subtitle2: 'test_subtitle2',
  labelName: 'test_label_name',
  labelEmail: 'test_label_email',
  labelComments: 'test_label_comments',
  labelClose: 'test_label_close',
  labelSubmit: 'test_label_submit',
  errorGeneric: 'test_error_generic',
  errorFormEntry: 'test_error_form_entry',
  successMessage: 'test_success_message',
});
