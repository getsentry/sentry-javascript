const errorBtn = document.getElementById('errorBtn');
errorBtn.addEventListener('click', () => {
  throw new Error('Sentry Test Error');
});

const fetchBtn = document.getElementById('fetchBtn');
fetchBtn.addEventListener('click', async () => {
  await fetch('http://example.com');
});
