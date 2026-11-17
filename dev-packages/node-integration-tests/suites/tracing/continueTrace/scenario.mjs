import * as Sentry from '@sentry/node';

// Share SDK initialization without letting one variant's propagation context leak into the next.
for (const { key, sentryTrace, baggage } of JSON.parse(process.env.INCOMING_TRACE_VARIANTS)) {
  Sentry.withIsolationScope(() => {
    Sentry.getIsolationScope().setTag('test.variant', key);
    Sentry.continueTrace({ sentryTrace, baggage }, () => {
      Sentry.startSpan({ name: 'continued-root-span', attributes: { 'test.variant': key } }, () => {
        // Capture while the root span is active so the error carries its trace context.
        Sentry.captureException(new Error(`continued-trace-error: ${key}`));
      });
    });
  });
}
