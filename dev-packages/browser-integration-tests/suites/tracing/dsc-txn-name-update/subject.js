const btnStartSpan = document.getElementById('btnStartSpan');
const btnUpdateName = document.getElementById('btnUpdateName');
const btnMakeRequest = document.getElementById('btnMakeRequest');
const btnCaptureError = document.getElementById('btnCaptureError');
const btnEndSpan = document.getElementById('btnEndSpan');

btnStartSpan.addEventListener('click', () => {
  Sentry.startSpanManual(
    { name: 'test-root-span', attributes: { [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url' } },
    async span => {
      window.__traceId = span.spanContext().traceId;
      await new Promise(resolve => {
        btnEndSpan.addEventListener('click', resolve);
      });
      span.end();
    },
  );
});

let updateCnt = 0;
btnUpdateName.addEventListener('click', () => {
  const span = Sentry.getActiveSpan();
  const rootSpan = Sentry.getRootSpan(span);
  rootSpan.updateName(`updated-root-span-${++updateCnt}`);
  rootSpan.setAttribute(Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
});

btnMakeRequest.addEventListener('click', () => {
  fetch('https://sentry-test-site.example/api');
});

btnCaptureError.addEventListener('click', () => {
  Sentry.captureException(new Error('test-error'));
});
