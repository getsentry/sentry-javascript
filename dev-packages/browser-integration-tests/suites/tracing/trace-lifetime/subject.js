const errorBtn = document.getElementById('errorBtn');
errorBtn.addEventListener('click', () => {
  throw new Error('Sentry Test Error');
});
