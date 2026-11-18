import * as Sentry from '@sentry/bun';

// The SDK checks for channel injection when the first span starts.
Sentry.startSpan({ name: 'request' }, () => undefined);
