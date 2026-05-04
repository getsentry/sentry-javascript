import * as SentryOpenTelemetry from '@sentry/opentelemetry';
import * as Sentry from '@sentry/browser';

// Verify that generally all imports can be resolved
// oxlint-disable-next-line no-console
for (const key in SentryOpenTelemetry) {
  console.log(key, SentryOpenTelemetry[key]);
}

// Verify that it console.errors if calling node-only thing
new SentryOpenTelemetry.SentryAsyncLocalStorageContextManager();

Sentry.captureException(new Error('test'));
