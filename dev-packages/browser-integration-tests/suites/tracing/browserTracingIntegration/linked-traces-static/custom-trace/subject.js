const btn1 = document.getElementById('btn1');
const btn2 = document.getElementById('btn2');

btn1.addEventListener('click', () => {
  Sentry.startNewTrace(() => {
    Sentry.startSpan({ name: 'custom root span 1', op: 'custom' }, () => {});
  });
});

btn2.addEventListener('click', () => {
  Sentry.startNewTrace(() => {
    Sentry.startSpan({ name: 'custom root span 2', op: 'custom' }, () => {});
  });
});
