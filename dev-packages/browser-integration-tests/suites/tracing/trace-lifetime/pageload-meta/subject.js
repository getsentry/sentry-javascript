const errorBtn = document.getElementById('errorBtn');
errorBtn.addEventListener('click', () => {
  throw new Error(`Sentry Test Error ${Math.random()}`);
});

const fetchBtn = document.getElementById('fetchBtn');
fetchBtn.addEventListener('click', async () => {
  await fetch('http://sentry-test-site.io');
});

const xhrBtn = document.getElementById('xhrBtn');
xhrBtn.addEventListener('click', () => {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', 'http://sentry-test-site.io');
  xhr.send();
});
