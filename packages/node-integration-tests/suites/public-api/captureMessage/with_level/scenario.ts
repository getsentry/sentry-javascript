import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
});

Sentry.captureMessage('debug_message', Sentry.Severity.Debug);
Sentry.captureMessage('info_message', Sentry.Severity.Info);
Sentry.captureMessage('warning_message', Sentry.Severity.Warning);
Sentry.captureMessage('error_message', Sentry.Severity.Error);
Sentry.captureMessage('fatal_message', Sentry.Severity.Fatal);
Sentry.captureMessage('critical_message', Sentry.Severity.Critical);
Sentry.captureMessage('log_message', Sentry.Severity.Log);
