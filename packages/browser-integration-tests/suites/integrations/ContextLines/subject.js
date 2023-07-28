document.getElementById('script-error-btn').addEventListener('click', () => {
  throw new Error('Error without context lines');
});
