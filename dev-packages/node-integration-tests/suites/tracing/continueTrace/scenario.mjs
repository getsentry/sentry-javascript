import * as Sentry from '@sentry/node';

// The incoming trace headers are injected per-runner via `.withEnv()`. Missing env vars become
// `undefined`, which exercises the "no incoming sentry-trace" variant.
const sentryTrace = process.env.INCOMING_SENTRY_TRACE || undefined;
const baggage = process.env.INCOMING_BAGGAGE || undefined;

Sentry.continueTrace({ sentryTrace, baggage }, () => {
  Sentry.startSpan({ name: 'continued-root-span' }, () => {
    // Captured while the root span is active. The error is emitted before the span ends, so the
    // error envelope always precedes the transaction envelope (ordered assertions rely on this).
    Sentry.captureException(new Error('continued-trace-error'));
  });
});
