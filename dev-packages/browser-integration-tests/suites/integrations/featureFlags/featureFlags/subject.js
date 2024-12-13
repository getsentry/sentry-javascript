document.getElementById('error').addEventListener('click', () => {
  throw new Error('Button triggered error');
});
