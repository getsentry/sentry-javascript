import * as Sentry from '@sentry/browser';

document.getElementById('open').addEventListener('click', () => {
  Sentry.getClient().emit('openFeedbackWidget');
});

document.getElementById('send').addEventListener('click', () => {
  Sentry.getClient().emit('beforeSendFeedback');
});
