const errorBtn = document.getElementById('errorBtn');
errorBtn.addEventListener('click', () => {
  throw new Error('Sentry Test Error');
});

const fetchBtn = document.getElementById('fetchBtn');
fetchBtn.addEventListener('click', async () => {
  await fetch('http://example.com');
});

const xhrBtn = document.getElementById('xhrBtn');
xhrBtn.addEventListener('click', () => {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', 'http://example.com');
  xhr.send();
});
