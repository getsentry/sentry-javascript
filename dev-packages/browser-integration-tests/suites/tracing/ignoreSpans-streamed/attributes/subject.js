// This segment span matches ignoreSpans via attributes — segment + child should be dropped
Sentry.startSpan({ name: 'health-check', attributes: { 'http.status_code': 200 } }, () => {
  Sentry.startSpan({ name: 'child-of-ignored' }, () => {});
});

setTimeout(() => {
  // This segment span does NOT match — segment + child should be sent
  Sentry.startSpan({ name: 'normal-segment', attributes: { 'http.status_code': 500 } }, () => {
    Sentry.startSpan({ name: 'child-span' }, () => {});
  });
}, 1000);
