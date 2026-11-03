const errorBtn = document.getElementById('errorBtn');
errorBtn.addEventListener('click', () => {
  throw new Error(`Sentry Test Error ${Math.random()}`);
});

const fetchBtn = document.getElementById('fetchBtn');
fetchBtn.addEventListener('click', async () => {
  await fetch('http://sentry-test-site.example');
});

const xhrBtn = document.getElementById('xhrBtn');
xhrBtn.addEventListener('click', () => {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', 'http://sentry-test-site.example');
  xhr.send();
});

const spanAndFetchBtn = document.getElementById('spanAndFetchBtn');
spanAndFetchBtn.addEventListener('click', () => {
  Sentry.startSpan({ name: 'custom-root-span' }, async () => {
    await fetch('http://sentry-test-site.example');
  });
});
