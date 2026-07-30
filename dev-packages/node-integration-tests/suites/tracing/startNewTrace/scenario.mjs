import * as Sentry from '@sentry/node';

// Run inside an ambient active span to prove startNewTrace detaches from any surrounding trace.
Sentry.startSpan({ name: 'outer-ambient-span' }, outerSpan => {
  const outerTraceId = outerSpan.spanContext().traceId;

  Sentry.startNewTrace(() => {
    // The trace id the API set on the current scope's propagation context.
    const newTraceId = Sentry.getCurrentScope().getPropagationContext().traceId;

    // Two independent root inactive spans inside the SAME startNewTrace callback.
    // They must all share the same `newTraceId`.
    // In TwP / rate=0 these are NonRecordingSpans but still carry a traceId.
    const span1 = Sentry.startInactiveSpan({ name: 'new-trace-inactive-1' });
    const span2 = Sentry.startInactiveSpan({ name: 'new-trace-inactive-2' });
    span1.end();
    span2.end();

    Sentry.startSpan({ name: 'new-trace-active-span' }, activeSpan => {
      const traceData = Sentry.getTraceData();

      Sentry.withScope(scope => {
        scope.setContext('startNewTrace', {
          outerTraceId,
          newTraceId,
          span1TraceId: span1.spanContext().traceId,
          span2TraceId: span2.spanContext().traceId,
          activeSpanTraceId: activeSpan.spanContext().traceId,
          sentryTrace: traceData['sentry-trace'],
          baggage: traceData.baggage,
        });
        Sentry.captureException(new Error('new-trace-error'));
      });
    });
  });
});
