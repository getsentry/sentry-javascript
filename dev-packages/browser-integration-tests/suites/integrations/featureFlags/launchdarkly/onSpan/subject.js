const btnStartSpan = document.getElementById('btnStartSpan');
const btnEndSpan = document.getElementById('btnEndSpan');
const btnStartNestedSpan = document.getElementById('btnStartNestedSpan');
const btnEndNestedSpan = document.getElementById('btnEndNestedSpan');

window.withNestedSpans = callback => {
  window.Sentry.startSpan({ name: 'test-root-span' }, rootSpan => {
    window.traceId = rootSpan.spanContext().traceId;

    window.Sentry.startSpan({ name: 'test-span' }, _span => {
      window.Sentry.startSpan({ name: 'test-nested-span' }, _nestedSpan => {
        callback();
      });
    });
  });
};
