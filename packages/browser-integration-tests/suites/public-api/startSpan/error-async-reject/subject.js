async function run() {
  await Sentry.startSpan({ name: 'parent_span' }, async () => {
    Promise.reject('Async Promise Rejection');
  });
}

const button = document.getElementById('button1');
button.addEventListener('click', async () => {
  await run();
});
