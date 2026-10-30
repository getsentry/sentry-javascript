import * as Sentry from '@sentry/node';

// The incoming trace headers are injected per-runner via `.withEnv()`. Missing env vars become
// `undefined`, which exercises the "no incoming sentry-trace" variant.
const sentryTrace = process.env.INCOMING_SENTRY_TRACE || undefined;
const baggage = process.env.INCOMING_BAGGAGE || undefined;

Sentry.continueTrace({ sentryTrace, baggage }, () => {
  Sentry.startSpan({ name: 'continued-root-span' }, () => {
    // Read here, not in `beforeSend`: on Bun, `beforeSend` does not run in the span's async context.
    Sentry.getCurrentScope().setContext('traceData', { ...Sentry.getTraceData() });
    // Capture while the root span is active so the error carries its trace context.
    Sentry.captureException(new Error('continued-trace-error'));
  });
});
