document.getElementById('error1').addEventListener('click', () => {
  throw new Error('First Error');
});

document.getElementById('error2').addEventListener('click', () => {
  throw new Error('Second Error');
});

document.getElementById('click').addEventListener('click', () => {
  // Just a click for interaction
});
