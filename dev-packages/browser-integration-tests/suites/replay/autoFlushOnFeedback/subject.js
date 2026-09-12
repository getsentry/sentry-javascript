import * as Sentry from '@sentry/browser';

document.getElementById('open').addEventListener('click', () => {
  Sentry.getClient().emit('openFeedbackWidget');
});

document.getElementById('submit').addEventListener('click', () => {
  Sentry.getClient().emit(
    'beforeSendFeedback',
    { contexts: { feedback: { message: 'test', source: 'widget' } }, type: 'feedback' },
    { includeReplay: true },
  );
});

document.getElementById('close').addEventListener('click', () => {
  Sentry.getClient().emit('closeFeedbackWidget');
});
