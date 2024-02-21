const el = document.querySelector('body');

Sentry.setContext('non_serializable', el);

Sentry.captureMessage('non_serializable');
