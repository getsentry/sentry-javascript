async function run() {
  await Sentry.startSpan({ name: 'parent_span' }, async () => {
    throw new Error('Async Thrown Error');
  });
}

const button = document.getElementById('button1');
button.addEventListener('click', async () => {
  await run();
});
