const newTraceBtn = document.getElementById('newTrace');

newTraceBtn.addEventListener('click', () => {
  Sentry.startNewTrace(() => {
    // Multiple root spans created within the same `startNewTrace` callback must all belong to the one
    // new trace. Each becomes its own transaction when ended.
    const span1 = Sentry.startInactiveSpan({ op: 'custom', name: 'new-trace-span-1' });
    span1.end();

    const span2 = Sentry.startInactiveSpan({ op: 'custom', name: 'new-trace-span-2' });
    span2.end();

    Sentry.startSpan({ op: 'custom', name: 'new-trace-span-3' }, () => {});
  });
});
