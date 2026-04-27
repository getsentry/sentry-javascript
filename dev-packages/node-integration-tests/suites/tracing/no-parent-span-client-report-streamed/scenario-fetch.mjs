import * as Sentry from '@sentry/node';
fetch('http://localhost:9999/external').catch(() => {
  void Sentry.flush();
});
