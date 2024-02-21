const el = document.querySelector('body');

Sentry.setExtra('non_serializable', el);

Sentry.captureMessage('non_serializable');
